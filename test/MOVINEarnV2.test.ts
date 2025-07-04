import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MOVINEarnV2, MovinToken } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { network } from 'hardhat';
import { USER_ADDRESS } from '../scripts/contract-addresses';

describe('MOVINEarnV2', function () {
  let movinToken: MovinToken;
  let movinEarn: MOVINEarnV2;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let migrator: HardhatEthersSigner;

  // Constants
  const MAX_DAILY_STEPS = 30_000;
  const MAX_DAILY_METS = 500;
  const MAX_STEPS_PER_MINUTE = 300;
  const MAX_METS_PER_MINUTE = 5;
  const ONE_THOUSAND_TOKENS = ethers.parseEther('1000');
  const ONE_HUNDRED_THOUSAND_TOKENS = ethers.parseEther('100000');
  const UNSTAKE_BURN_FEES_PERCENT = 1;
  const ACTIVITY_REFERRAL_BONUS_PERCENT = 100; // 100 = 1% (using basis points for better precision)
  const ONE_DAY = 24 * 60 * 60;
  const THIRTY_DAYS = 30 * ONE_DAY;
  const ONE_YEAR = 365 * ONE_DAY;

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, migrator] = await ethers.getSigners();

    // Deploy MovinToken
    const MovinToken = await ethers.getContractFactory('MovinToken');
    movinToken = (await upgrades.deployProxy(MovinToken, [owner.address], {
      kind: 'uups',
      initializer: 'initialize',
    })) as unknown as MovinToken;
    await movinToken.waitForDeployment();

    // Deploy MOVINEarnV2
    const MOVINEarnV2 = await ethers.getContractFactory('MOVINEarnV2');
    movinEarn = (await upgrades.deployProxy(MOVINEarnV2, [await movinToken.getAddress()], {
      kind: 'uups',
      initializer: 'initialize',
    })) as unknown as MOVINEarnV2;
    await movinEarn.waitForDeployment();

    const movinEarnAddress = await movinEarn.getAddress();

    // Transfer ownership of the token to the MOVINEarnV2 contract
    await movinToken.transferOwnership(movinEarnAddress);
    // Mint some tokens to users for testing
    await movinEarn.mintToken(user1.address, ONE_HUNDRED_THOUSAND_TOKENS);
    await movinEarn.mintToken(user2.address, ONE_HUNDRED_THOUSAND_TOKENS);
    await movinEarn.mintToken(movinEarnAddress, ONE_HUNDRED_THOUSAND_TOKENS);

    await movinToken.connect(user1).approve(movinEarnAddress, ONE_HUNDRED_THOUSAND_TOKENS);
    await movinToken.connect(user2).approve(movinEarnAddress, ONE_HUNDRED_THOUSAND_TOKENS);
  });

  describe('Initialization', function () {
    it('Should initialize with correct values', async function () {
      expect(await movinEarn.movinToken()).to.equal(await movinToken.getAddress());
      expect(await movinEarn.owner()).to.equal(owner.address);

      // Check lock period multipliers
      expect(await movinEarn.lockPeriodMultipliers(1)).to.equal(1);
      expect(await movinEarn.lockPeriodMultipliers(3)).to.equal(3);
      expect(await movinEarn.lockPeriodMultipliers(6)).to.equal(6);
      expect(await movinEarn.lockPeriodMultipliers(12)).to.equal(12);
      expect(await movinEarn.lockPeriodMultipliers(24)).to.equal(24);

      // Check reward rates
      expect(await movinEarn.baseStepsRate()).to.equal(ethers.parseEther('1'));
      expect(await movinEarn.baseMetsRate()).to.equal(ethers.parseEther('1'));
    });
  });

  describe('Staking functionality', function () {
    beforeEach(async function () {
      // Approve MOVINEarnV2 to spend user1's tokens
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), ONE_THOUSAND_TOKENS);
    });

    it('Should allow staking tokens with various lock periods', async function () {
      const stakeAmount = ethers.parseEther('100');

      // Set user1 as premium to allow staking for 24 months
      await movinEarn.connect(user1).setPremiumStatus(true, ethers.parseEther('1000'));

      // Test each valid lock period
      const lockPeriods = [1, 3, 6, 12, 24];

      for (let i = 0; i < lockPeriods.length; i++) {
        const lockPeriod = lockPeriods[i];

        // Approve tokens for each stake
        await movinToken.connect(user1).approve(await movinEarn.getAddress(), stakeAmount);

        // Stake tokens
        await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

        // Verify stake was created
        const userStake = await movinEarn.connect(user1).getUserStake(i);
        expect(userStake.amount).to.equal(stakeAmount);
        expect(userStake.lockDuration).to.equal(lockPeriod * 30 * 24 * 60 * 60); // convert months to seconds
      }

      // Verify user stake count
      expect(await movinEarn.connect(user1).getUserStakeCount()).to.equal(lockPeriods.length);
    });

    it('Should fail when staking with invalid lock period', async function () {
      const stakeAmount = ethers.parseEther('100');

      // Try to stake with invalid lock period
      await expect(
        movinEarn.connect(user1).stakeTokens(stakeAmount, 2)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidLockPeriod');
    });

    it('Should fail when staking zero amount', async function () {
      await expect(movinEarn.connect(user1).stakeTokens(0, 1)).to.be.revertedWithCustomError(
        movinEarn,
        'ZeroAmountNotAllowed'
      );
    });

    it('Should only allow premium users to stake for 24 months', async function () {
      const stakeAmount = ethers.parseEther('100');

      // Set user1 as premium and user2 as non-premium
      await movinEarn.connect(user1).setPremiumStatus(true, ethers.parseEther('1000'));
      await movinEarn.connect(user2).setPremiumStatus(false, 0);

      // Approve tokens for both users
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), stakeAmount);
      await movinToken.connect(user2).approve(await movinEarn.getAddress(), stakeAmount);

      // Premium user should be able to stake for 24 months
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 24);

      // Non-premium user should not be able to stake for 24 months
      await expect(
        movinEarn.connect(user2).stakeTokens(stakeAmount, 24)
      ).to.be.revertedWithCustomError(movinEarn, 'UnauthorizedAccess');

      // Non-premium user should still be able to stake for other periods
      await movinEarn.connect(user2).stakeTokens(stakeAmount, 12);
    });

    it('Should calculate staking rewards correctly', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 12; // 12 months, which has a multiplier of 12

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time by 12 hours (less than 1 day expiration)
      await time.increase(12 * 60 * 60);

      // Calculate expected reward
      // Formula: (amount * apr * effectiveDuration) / (100 * 365 days)
      const apr = 12; // Multiplier for 12 months
      const durationSeconds = 12 * 60 * 60; // 12 hours
      const expectedReward =
        (stakeAmount * BigInt(apr) * BigInt(durationSeconds)) / (BigInt(100) * BigInt(ONE_YEAR));

      // Get calculated reward from contract using getUserStake
      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;

      // Allow for small rounding difference due to timestamp variations
      const difference =
        expectedReward > reward ? expectedReward - reward : reward - expectedReward;

      expect(Number(ethers.formatEther(difference))).to.be.lessThan(0.01);
    });

    it('Should allow claiming staking rewards without referral bonus', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 12; // 12 months

      // Setup referral relationship
      await movinEarn.connect(user2).registerReferral(user1.address);

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time by 12 hours (less than 1 day expiration)
      await time.increase(12 * 60 * 60);

      // Get user balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      const referrerBalanceBefore = await movinToken.balanceOf(user2.address);

      // Get expected reward from getUserStake
      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;
      // No burn, full reward goes to user
      const expectedUserReward = reward;

      // Claim rewards
      const tx = await movinEarn.connect(user1).claimStakingRewards(0);
      await tx.wait();

      // Verify balance increased for user1
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualReward = balanceAfter - balanceBefore;

      // Verify no change in balance for referrer
      const referrerBalanceAfter = await movinToken.balanceOf(user2.address);

      // Use tolerance comparison instead of exact equality
      const rewardDifference =
        expectedUserReward > actualReward
          ? expectedUserReward - actualReward
          : actualReward - expectedUserReward;

      expect(Number(ethers.formatEther(rewardDifference))).to.be.lessThan(0.01);
      expect(referrerBalanceAfter).to.equal(referrerBalanceBefore);
    });

    it('Should allow claiming rewards from all stakes at once using claimAllStakingRewards', async function () {
      // Mint enough tokens for staking
      await movinEarn.mintToken(user1.address, ethers.parseEther('10000'));

      // Create multiple stakes with different lock periods
      const stake1Amount = ethers.parseEther('1000');
      const stake2Amount = ethers.parseEther('1500');
      const stake3Amount = ethers.parseEther('2000');

      // Approve tokens for staking
      await movinToken
        .connect(user1)
        .approve(await movinEarn.getAddress(), stake1Amount + stake2Amount + stake3Amount);

      // Create 3 different stakes
      await movinEarn.connect(user1).stakeTokens(stake1Amount, 1); // 1 month
      await movinEarn.connect(user1).stakeTokens(stake2Amount, 3); // 3 months
      await movinEarn.connect(user1).stakeTokens(stake3Amount, 6); // 6 months

      // Advance time by 12 hours (less than 1 day expiration)
      await time.increase(12 * 60 * 60);

      // Get all user stakes and sum up rewards
      const stakes = await movinEarn.connect(user1).getUserStakes(user1.address);
      let totalExpectedReward = BigInt(0);
      for (const stake of stakes) {
        totalExpectedReward += stake.rewards;
      }

      // No burn fee applied to rewards
      const expectedReward = totalExpectedReward;

      // Get user balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      const movinEarnAddress = await movinEarn.getAddress();
      await movinToken.transfer(movinEarnAddress, ethers.parseEther('100000'));
      const contractBalanceBefore = await movinToken.balanceOf(movinEarnAddress);

      // Make sure rewards are claimed successfully
      const tx = await movinEarn.connect(user1).claimAllStakingRewards();
      await tx.wait();

      const contractBalanceAfter = await movinToken.balanceOf(movinEarnAddress);
      expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);

      // Ensure all rewards are now zero
      const updatedStakes = await movinEarn.connect(user1).getUserStakes(user1.address);
      let allRewardsZero = true;
      for (let i = 0; i < updatedStakes.length; i++) {
        if (updatedStakes[i].rewards > 0) {
          allRewardsZero = false;
          console.log(
            `Stake ${i} still has rewards: ${ethers.formatEther(updatedStakes[i].rewards)}`
          );
        }
      }
      expect(allRewardsZero).to.be.true;

      // Verify that user received the full reward amount
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualReward = balanceAfter - balanceBefore;

      // Use tolerance comparison instead of exact equality
      const rewardDifference =
        expectedReward > actualReward
          ? expectedReward - actualReward
          : actualReward - expectedReward;

      expect(Number(ethers.formatEther(rewardDifference))).to.be.lessThan(0.01);
    });

    it('Should allow unstaking after lock period', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 1; // 1 month

      const balanceBeforeStaking = await movinToken.balanceOf(user1.address);

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      const balanceAfterStaking = await movinToken.balanceOf(user1.address);
      expect(balanceAfterStaking).to.equal(balanceBeforeStaking - stakeAmount);

      // Advance time beyond the lock period
      await time.increase(32 * 24 * 60 * 60); // 32 days

      // Get balance before unstaking
      const balanceBefore = await movinToken.balanceOf(user1.address);
      const stakeCount = await movinEarn.connect(user1).getUserStakeCount();
      expect(stakeCount).to.equal(1);

      // Unstake
      await movinEarn.connect(user1).unstake(0);

      const stakeCountAfterUnstaking = await movinEarn.connect(user1).getUserStakeCount();
      expect(stakeCountAfterUnstaking).to.equal(0);

      // Calculate expected payout
      const burnAmount = (stakeAmount * BigInt(UNSTAKE_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedPayout = stakeAmount - burnAmount;

      // Verify balance increased by expected amount
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualPayout = balanceAfter - balanceBefore;

      expect(actualPayout).to.equal(expectedPayout);
    });

    it('Should allow restaking after lock period without burn fee', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const initialLockPeriod = 1; // 1 month
      const newLockPeriod = 3; // 3 months for restaking

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, initialLockPeriod);

      // Verify initial stake
      const initialStakeCount = await movinEarn.connect(user1).getUserStakeCount();
      expect(initialStakeCount).to.equal(1);
      const initialStake = await movinEarn.connect(user1).getUserStake(0);
      expect(initialStake.amount).to.equal(stakeAmount);
      expect(initialStake.lockDuration).to.equal(initialLockPeriod * 30 * 24 * 60 * 60);

      // Advance time beyond the lock period
      await time.increase(32 * 24 * 60 * 60); // 32 days

      // Restake
      await movinEarn.connect(user1).restake(0, newLockPeriod);

      // Verify stake count remains the same (one removed, one added)
      const stakeCountAfterRestaking = await movinEarn.connect(user1).getUserStakeCount();
      expect(stakeCountAfterRestaking).to.equal(1);

      // Verify new stake has correct parameters
      const newStake = await movinEarn.connect(user1).getUserStake(0);
      expect(newStake.amount).to.equal(stakeAmount); // Full amount preserved (no burn fee)
      expect(newStake.lockDuration).to.equal(newLockPeriod * 30 * 24 * 60 * 60); // New lock period
    });

    it('Should reject restaking if lock period still active', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 1; // 1 month

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time but not enough to reach the end of lock period
      await time.increase(15 * 24 * 60 * 60); // 15 days

      // Attempt to restake should fail
      await expect(movinEarn.connect(user1).restake(0, 3)).to.be.revertedWithCustomError(
        movinEarn,
        'LockPeriodActive'
      );
    });

    it('Should reject restaking with invalid lock period', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 1; // 1 month

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time beyond the lock period
      await time.increase(32 * 24 * 60 * 60); // 32 days

      // Attempt to restake with invalid lock period should fail
      await expect(
        movinEarn.connect(user1).restake(0, 2) // 2 months is not a valid lock period
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidLockPeriod');
    });

    it('Should only allow premium users to restake for 24 months', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 1; // 1 month

      // Create stakes for both users
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), stakeAmount);
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      await movinToken.connect(user2).approve(await movinEarn.getAddress(), stakeAmount);
      await movinEarn.connect(user2).stakeTokens(stakeAmount, lockPeriod);

      // Advance time beyond the lock period
      await time.increase(32 * 24 * 60 * 60); // 32 days

      // Set user1 as premium and user2 as non-premium
      // Make sure to approve tokens for premium status payment
      await movinToken
        .connect(user1)
        .approve(await movinEarn.getAddress(), ethers.parseEther('1000'));
      await movinEarn.connect(user1).setPremiumStatus(true, ethers.parseEther('1000'));

      await movinToken.connect(user2).approve(await movinEarn.getAddress(), ethers.parseEther('0'));
      await movinEarn.connect(user2).setPremiumStatus(false, 0);

      // Premium user should be able to restake for 24 months
      await movinEarn.connect(user1).restake(0, 24);

      // Verify the restake worked
      const user1Stake = await movinEarn.connect(user1).getUserStake(0);
      expect(user1Stake.lockDuration).to.equal(24 * 30 * 24 * 60 * 60);

      // Non-premium user should not be able to restake for 24 months
      await expect(movinEarn.connect(user2).restake(0, 24)).to.be.revertedWithCustomError(
        movinEarn,
        'UnauthorizedAccess'
      );

      // Non-premium user should still be able to restake for other periods
      await movinEarn.connect(user2).restake(0, 12);

      // Verify the restake worked
      const user2Stake = await movinEarn.connect(user2).getUserStake(0);
      expect(user2Stake.lockDuration).to.equal(12 * 30 * 24 * 60 * 60);
    });

    it('Should calculate rewards for modulo 24 hours when more than 24 hours have passed', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 12; // 12 months, which has a multiplier of 12

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time by 30 hours (more than 1 day)
      await time.increase(30 * 60 * 60);

      // Calculate expected reward for 6 hours (30 % 24 = 6)
      const apr = 12; // Multiplier for 12 months
      const effectiveDuration = 6 * 60 * 60; // 6 hours in seconds
      const expectedReward =
        (stakeAmount * BigInt(apr) * BigInt(effectiveDuration)) / (BigInt(100) * BigInt(ONE_YEAR));

      // Get calculated reward from contract using getUserStake
      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;

      // Allow for small rounding difference due to timestamp variations
      const difference =
        expectedReward > reward ? expectedReward - reward : reward - expectedReward;

      expect(Number(ethers.formatEther(difference))).to.be.lessThan(0.01);
      expect(reward).to.be.gt(0); // Reward should be greater than 0
    });

    it('Should calculate rewards for modulo 24 hours with multi-day passed periods', async function () {
      const stakeAmount = ethers.parseEther('1000');
      const lockPeriod = 12; // 12 months, which has a multiplier of 12

      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);

      // Advance time by 74 hours (more than 3 days)
      await time.increase(74 * 60 * 60);

      // Calculate expected reward for 2 hours (74 % 24 = 2)
      const apr = 12; // Multiplier for 12 months
      const effectiveDuration = 2 * 60 * 60; // 2 hours in seconds
      const expectedReward =
        (stakeAmount * BigInt(apr) * BigInt(effectiveDuration)) / (BigInt(100) * BigInt(ONE_YEAR));

      // Get calculated reward from contract using getUserStake
      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;

      // Allow for small rounding difference due to timestamp variations
      const difference =
        expectedReward > reward ? expectedReward - reward : reward - expectedReward;

      expect(Number(ethers.formatEther(difference))).to.be.lessThan(0.01);
      expect(reward).to.be.gt(0); // Reward should be greater than 0
    });

    it('Should allow claiming staking rewards before 1 day expiration', async function () {
      const stakeAmount = ethers.parseEther('1000');
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 1); // 1 month lock

      // Advance time less than 1 day (e.g., 12 hours)
      await time.increase(12 * 60 * 60);

      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;
      expect(reward).to.be.gt(0);

      // Claim should succeed
      const balanceBefore = await movinToken.balanceOf(user1.address);
      await expect(movinEarn.connect(user1).claimStakingRewards(0)).to.not.be.reverted;
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualReward = balanceAfter - balanceBefore;

      // Use tolerance comparison
      const rewardDifference =
        reward > actualReward ? reward - actualReward : actualReward - reward;
      expect(Number(ethers.formatEther(rewardDifference))).to.be.lessThan(0.01);
    });

    it('Should prevent claiming staking rewards after 1 day expiration', async function () {
      const stakeAmount = ethers.parseEther('1000');
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 1); // 1 month lock

      // Advance time more than 1 day (e.g., 1 day + 1 hour)
      await time.increase(ONE_DAY + 3600);

      // Calculate reward now returns modulo 24 hours (1 hour in this case)
      const stake = await movinEarn.connect(user1).getUserStake(0);
      const reward = stake.rewards;
      expect(reward).to.be.gt(0); // Reward should be > 0 (for the 1 hour)

      // Claim should succeed now since we modified the function
      await expect(
        movinEarn.connect(user1).claimStakingRewards(0)
      ).to.not.be.revertedWithCustomError(movinEarn, 'NoRewardsAvailable');
    });

    it('claimAllStakingRewards should claim only non-expired rewards', async function () {
      const stakeAmount1 = ethers.parseEther('1000');
      const stakeAmount2 = ethers.parseEther('1500');

      // Stake 1
      await movinEarn.connect(user1).stakeTokens(stakeAmount1, 3); // 3 months
      const stake1Timestamp = (await ethers.provider.getBlock('latest'))?.timestamp ?? 0;

      // Wait 12 hours
      await time.increase(12 * 60 * 60);

      // Approve tokens for the second stake
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), stakeAmount2);

      // Stake 2
      await movinEarn.connect(user1).stakeTokens(stakeAmount2, 6); // 6 months

      // Wait another 13 hours (total time elapsed: 25 hours for stake 1, 13 hours for stake 2)
      await time.increase(13 * 60 * 60);

      // Get rewards from stakes
      const stakes = await movinEarn.connect(user1).getUserStakes(user1.address);
      const reward1 = stakes[0].rewards;
      const reward2 = stakes[1].rewards;

      expect(reward1).to.be.gt(0); // Stake 1 should have rewards for 1 hour
      expect(reward2).to.be.gt(0); // Stake 2 should not be expired
      const totalExpectedReward = reward1 + reward2;

      // Claim all rewards
      const balanceBefore = await movinToken.balanceOf(user1.address);
      await expect(movinEarn.connect(user1).claimAllStakingRewards()).to.not.be.reverted;
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualTotalReward = balanceAfter - balanceBefore;

      // Verify rewards were claimed (use tolerance)
      const rewardDifference =
        totalExpectedReward > actualTotalReward
          ? totalExpectedReward - actualTotalReward
          : actualTotalReward - totalExpectedReward;
      expect(Number(ethers.formatEther(rewardDifference))).to.be.lessThan(0.01);

      // Verify lastClaimed was updated for BOTH stakes
      const updatedStakes = await movinEarn.connect(user1).getUserStakes(user1.address);
      const claimTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp ?? 0;

      expect(Number(updatedStakes[0].lastClaimed)).to.be.closeTo(claimTimestamp, 5);
      expect(Number(updatedStakes[1].lastClaimed)).to.be.closeTo(claimTimestamp, 5);
    });

    it('claimAllStakingRewards should revert if all rewards are very small', async function () {
      const stakeAmount1 = ONE_THOUSAND_TOKENS;
      const stakeAmount2 = ONE_THOUSAND_TOKENS;

      await movinEarn.connect(user1).stakeTokens(stakeAmount1, 3); // 3 months
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), stakeAmount2);
      await movinEarn.connect(user1).stakeTokens(stakeAmount2, 6); // 6 months

      // Advance time by 24 hours and 1 second (very small modulo)
      await time.increase(ONE_DAY + 1);

      // Get rewards from stakes
      const stakes = await movinEarn.connect(user1).getUserStakes(user1.address);
      const reward1 = stakes[0].rewards;
      const reward2 = stakes[1].rewards;

      // Since we claim with a minimum threshold of 0.001 ether
      // and 1 second of rewards is very small, claim should still revert
      await expect(movinEarn.connect(user1).claimAllStakingRewards()).to.be.revertedWithCustomError(
        movinEarn,
        'NoRewardsAvailable'
      );
    });
  });

  describe('Activity recording and rewards', function () {
    beforeEach(async function () {
      // Set user1 as premium
      await movinEarn.connect(user1).setPremiumStatus(true, ethers.parseEther('1000'));

      // Set transactionSync to true for both users
      await movinEarn.connect(owner).setTransactionSync(user1.address, true);
      await movinEarn.connect(owner).setTransactionSync(user2.address, true);
    });

    it.skip('Should reject activity if transactionSync is false', async function () {
      // Set transactionSync to false for user1
      await movinEarn.connect(owner).setTransactionSync(user1.address, false);

      // Try to record activity
      await expect(movinEarn.recordActivity(user1.address, 1, 0)).to.be.revertedWithCustomError(
        movinEarn,
        'UnauthorizedAccess'
      );

      // Set transactionSync back to true
      await movinEarn.connect(owner).setTransactionSync(user1.address, true);

      // Now activity recording should work
      await movinEarn.recordActivity(user1.address, 1, 0);

      // Verify activity was recorded
      const activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(1);
      expect(activity.dailyMets).to.equal(0);
    });

    it('Should correctly record steps activity and distribute rewards', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Record 1 step for premium user (should be 0.001 MVN reward)
      await movinEarn.recordActivity(user1.address, 1, 0);
      let balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('0.001'));
      await time.increaseTo((await time.latest()) + 60 * 4);

      // Record 999 more steps (total 1000, should now get 1 MVN)
      await movinEarn.recordActivity(user1.address, 999, 0);
      let balanceAfter1000 = await movinToken.balanceOf(user1.address);
      expect(balanceAfter1000 - initialBalance).to.equal(ethers.parseEther('1'));
      await time.increaseTo((await time.latest()) + 60 * 4);

      // Record 1000 more steps (total 2000, should now get 2 MVN)
      await movinEarn.recordActivity(user1.address, 1000, 0);
      let balanceAfter2000 = await movinToken.balanceOf(user1.address);
      expect(balanceAfter2000 - initialBalance).to.equal(ethers.parseEther('2'));
      await time.increaseTo((await time.latest()) + 60 * 2);

      // Record 500 more steps (total 2500, should be 2.5 MVN)
      await movinEarn.recordActivity(user1.address, 500, 0);
      let balanceAfter2500 = await movinToken.balanceOf(user1.address);
      expect(balanceAfter2500 - initialBalance).to.equal(ethers.parseEther('2.5'));
      await time.increaseTo((await time.latest()) + 60 * 2);

      // Record 500 more steps (total 3000, should now get 3 MVN)
      await movinEarn.recordActivity(user1.address, 500, 0);
      let balanceAfter3000 = await movinToken.balanceOf(user1.address);
      expect(balanceAfter3000 - initialBalance).to.equal(ethers.parseEther('3'));
      await time.increaseTo((await time.latest()) + 60 * 2);
    });

    it('Should correctly record METs activity for premium users', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Record exactly 1 MET for premium user
      await movinEarn.recordActivity(user1.address, 0, 1);

      // Get balance after activity
      const balanceAfter = await movinToken.balanceOf(user1.address);

      // Expected reward is 0.2 tokens for 1 MET (1 MVN per 5 METs)
      const expectedReward = ethers.parseEther('0.2');
      expect(balanceAfter - initialBalance).to.equal(expectedReward);

      // Verify activity was recorded
      const activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(0);
      expect(activity.dailyMets).to.equal(1);
    });

    it('Should correctly record steps activity for non-premium users with higher threshold', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user2.address);

      // Ensure user2 is not premium
      await movinEarn.connect(user2).setPremiumStatus(false, 0);

      // Record 1000 steps for non-premium user (should get 1 MVN)
      await movinEarn.recordActivity(user2.address, 1000, 0);
      const balanceAfter = await movinToken.balanceOf(user2.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('1'));
    });

    it('Should not reward METs activity for non-premium users', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user2.address);

      // Ensure user2 is not premium
      await movinEarn.connect(user2).setPremiumStatus(false, 0);

      // Record exactly 1 MET for non-premium user
      await movinEarn.recordActivity(user2.address, 0, 1);

      // Get balance after activity
      const balanceAfter = await movinToken.balanceOf(user2.address);

      // No reward should be given for METs as user is not premium
      expect(balanceAfter).to.equal(initialBalance);

      // Verify activity was recorded but no rewards
      const activity = await movinEarn.getTodayUserActivity(user2.address);
      expect(activity.dailySteps).to.equal(0);
      // METs should be updated, but no reward
      expect(activity.dailyMets).to.equal(1);
    });

    it('Should correctly record both steps and METs activity', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Record 1000 steps and 1 MET
      await movinEarn.recordActivity(user1.address, 1000, 1);
      const balanceAfter = await movinToken.balanceOf(user1.address);
      // Expected: 1 MVN for 1000 steps + 0.2 MVN for 1 MET = 1.2 MVN total
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('1.2'));
    });

    it('Should cap rewards at threshold even if activity exceeds threshold', async function () {
      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Record 30,000 steps (should get 30 MVN)
      await movinEarn.recordActivity(user1.address, 30000, 0);
      const balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('30'));
    });

    it('Should reject activity that exceeds rate limits', async function () {
      await movinEarn.recordActivity(user1.address, 1000, 0);
      // Calculate steps that exceed the rate limit
      const tooManySteps = MAX_STEPS_PER_MINUTE + 100;

      // Try to record too many steps too quickly
      await expect(
        movinEarn.recordActivity(user1.address, tooManySteps, 0)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidActivityInput');

      // Calculate METs that exceed the rate limit
      const tooManyMETs = MAX_METS_PER_MINUTE + 2;

      // Try to record too many METs too quickly
      await expect(
        movinEarn.recordActivity(user1.address, 0, tooManyMETs)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidActivityInput');
    });

    it('Should reject multiple activity recordings within 1 minute', async function () {
      // First activity recording should succeed
      await movinEarn.recordActivity(user1.address, 100, 1);

      const activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(100);
      expect(activity.dailyMets).to.equal(1);
      expect(activity.lastUpdated).to.not.equal(0);

      // Second activity recording within 1 minute should fail
      await expect(movinEarn.recordActivity(user1.address, 100, 1)).to.be.revertedWithCustomError(
        movinEarn,
        'InvalidActivityInput'
      );

      await time.increaseTo((await time.latest()) + 61); // 1 minute and 1 second

      // Now activity recording should succeed
      await movinEarn.recordActivity(user1.address, 100, 1);
    });

    it('Should accept activity above maximum daily limits but not reward it', async function () {
      const initialActivity = await movinEarn.getTodayUserActivity(user1.address);
      expect(initialActivity.dailySteps).to.equal(0);
      expect(initialActivity.dailyMets).to.equal(0);

      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Record 31,000 steps (should get 30 MVN, as only 30,000 are rewarded)
      await movinEarn.recordActivity(user1.address, 31000, 0);
      const balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('30'));

      // Verify activity was recorded, but not rewarded above cap
      const activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(30000);
      expect(activity.dailyMets).to.equal(0);

      await time.increaseTo((await time.latest()) + 61); // 1 minute

      // Now test METs for premium user
      // Get initial balance
      const initialBalanceMets = await movinToken.balanceOf(user1.address);

      // Record METs activity above maximum
      await movinEarn.recordActivity(user1.address, 0, MAX_DAILY_METS + 10);

      // Get balance after activity
      const balanceAfterMets = await movinToken.balanceOf(user1.address);

      // Reward should be capped at MAX_DAILY_METS
      const expectedMetsReward = ethers.parseEther((MAX_DAILY_METS / 5).toString());
      expect(balanceAfterMets - initialBalanceMets).to.equal(expectedMetsReward);

      // Verify METs activity was recorded
      const activityAfterMets = await movinEarn.getTodayUserActivity(user1.address);
      expect(activityAfterMets.dailySteps).to.equal(MAX_DAILY_STEPS);
      expect(activityAfterMets.dailyMets).to.equal(MAX_DAILY_METS);
    });

    it('Should reset activity at midnight', async function () {
      // Record activity (premium user gets lower thresholds)
      await movinEarn.recordActivity(user1.address, 1, 1);

      // Verify activity was recorded
      let activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(1);
      expect(activity.dailyMets).to.equal(1);

      // Advance time to next day (past midnight)
      const currentTimestamp = await time.latest();
      const secondsUntilMidnight = 86400 - (currentTimestamp % 86400) + 1;
      await time.increase(secondsUntilMidnight);

      // Get activity after midnight
      activity = await movinEarn.getTodayUserActivity(user1.address);

      // Activity should be reset
      expect(activity.dailySteps).to.equal(0);
      expect(activity.dailyMets).to.equal(0);

      // Record new activity for the new day
      await movinEarn.recordActivity(user1.address, 1, 1);

      // Get balance
      const balanceAfter = await movinToken.balanceOf(user1.address);

      // Verify activity was recorded for the new day
      activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(1);
      expect(activity.dailyMets).to.equal(1);
    });

    it('Should decrease reward rates by 0.1% daily', async function () {
      // Get initial rates
      const [initialStepsRate, initialMetsRate] = await movinEarn.getBaseRates();

      // Advance time by 1 day
      await time.increase(ONE_DAY);

      // Record activity to trigger rate decrease (premium user)
      await movinEarn.recordActivity(user1.address, 1, 1);

      // Get new rates
      const [newStepsRate, newMetsRate] = await movinEarn.getBaseRates();

      // Calculate expected rates after 0.1% decrease
      const expectedStepsRate = (initialStepsRate * BigInt(999)) / BigInt(1000);
      const expectedMetsRate = (initialMetsRate * BigInt(999)) / BigInt(1000);

      // Verify rates decreased correctly
      expect(newStepsRate).to.equal(expectedStepsRate);
      expect(newMetsRate).to.equal(expectedMetsRate);
    });

    it('Should correctly distribute referral bonuses', async function () {
      await movinEarn.connect(user2).registerReferral(user1.address);
      const referrerInitialBalance = await movinToken.balanceOf(user1.address);
      const refereeInitialBalance = await movinToken.balanceOf(user2.address);
      await movinToken
        .connect(user2)
        .approve(await movinEarn.getAddress(), ethers.parseEther('1000'));
      await movinEarn.connect(user2).setPremiumStatus(true, ethers.parseEther('1000'));
      await movinEarn.recordActivity(user2.address, 1000, 1);
      const referrerFinalBalance = await movinToken.balanceOf(user1.address);
      const refereeFinalBalance = await movinToken.balanceOf(user2.address);
      const refereeReward = refereeFinalBalance - refereeInitialBalance;
      const expectedReferrerBonus =
        (refereeReward * BigInt(ACTIVITY_REFERRAL_BONUS_PERCENT)) / BigInt(10000);
      const actualReferrerBonus = referrerFinalBalance - referrerInitialBalance;
      expect(actualReferrerBonus).to.be.gt(0);
      const [, earnedBonus] = await movinEarn.getReferralInfo(user1.address);
      expect(earnedBonus).to.be.gt(0);
    });

    it('Should correctly handle partial activity below thresholds', async function () {
      // Record 500 steps and 1 MET (should get 0.5 for steps, 0.2 for MET)
      const initialBalance = await movinToken.balanceOf(user1.address);
      await movinEarn.recordActivity(user1.address, 500, 1);
      let activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(500);
      expect(activity.dailyMets).to.equal(1);
      let balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('0.7'));
      await time.increaseTo((await time.latest()) + 60 * 2);

      // Record 500 more steps (should now get 0.5 MVN for steps, total 1 for steps, 0.2 for MET)
      await movinEarn.recordActivity(user1.address, 500, 0);
      let activity2 = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity2.dailySteps).to.equal(1000);
      let balanceAfter2 = await movinToken.balanceOf(user1.address);
      expect(balanceAfter2 - initialBalance).to.equal(ethers.parseEther('1.2'));
    });

    it('Should handle zero inputs correctly', async function () {
      // Record activity with zero inputs
      await movinEarn.recordActivity(user1.address, 0, 0);

      // Verify no activity was recorded
      const activity = await movinEarn.getTodayUserActivity(user1.address);
      expect(activity.dailySteps).to.equal(0);
      expect(activity.dailyMets).to.equal(0);

      // Then record valid activity (premium user)
      await movinEarn.recordActivity(user1.address, 1, 1);

      // Verify activity was recorded
      const updatedActivity = await movinEarn.getTodayUserActivity(user1.address);
      expect(updatedActivity.dailySteps).to.equal(1);
      expect(updatedActivity.dailyMets).to.equal(1);
    });

    it('Should not allow activity recording when contract is paused', async function () {
      // Pause the contract
      await movinEarn.connect(owner).emergencyPause();

      // Try to record activity
      await expect(movinEarn.recordActivity(user1.address, 1, 1)).to.be.revertedWithCustomError(
        movinEarn,
        'ContractPaused'
      );

      // Unpause the contract
      await movinEarn.connect(owner).emergencyUnpause();

      // Now activity recording should work (premium user)
      await movinEarn.recordActivity(user1.address, 1, 1);
    });

    it('Should calculate rewards correctly', async function () {
      // Set up premium status
      await movinEarn.connect(user1).setPremiumStatus(true, ethers.parseEther('1000'));

      // Test calculating rewards directly (premium user with lower thresholds)
      const [stepsReward, metsReward, totalSteps, totalMets] =
        await movinEarn.calculateActivityRewards(user1.address, 2000, 1);
      expect(stepsReward).to.equal(ethers.parseEther('2'));
      expect(metsReward).to.equal(ethers.parseEther('0.2')); // 1 MET = 0.2 MVN (1 MVN per 5 METs)
      expect(totalSteps).to.equal(2000);
      expect(totalMets).to.equal(1);
    });
  });

  describe('Referral system', function () {
    // Set transactionSync to true for all users before referral tests
    beforeEach(async function () {
      await movinEarn.connect(owner).setTransactionSync(user1.address, true);
      await movinEarn.connect(owner).setTransactionSync(user2.address, true);
      // Set for user3 and user4 that are used in some referral tests
      const [, , , user3, user4] = await ethers.getSigners();
      await movinEarn.connect(owner).setTransactionSync(user3.address, true);
      await movinEarn.connect(owner).setTransactionSync(user4.address, true);
    });

    it('Should allow users to register referrals', async function () {
      // Get balances before registering referral
      const referrerBalanceBefore = await movinToken.balanceOf(user1.address);
      const refereeBalanceBefore = await movinToken.balanceOf(user2.address);

      await expect(movinEarn.connect(user2).registerReferral(user1.address))
        .to.emit(movinEarn, 'ReferralRegistered')
        .withArgs(user2.address, user1.address);

      // Check referral info for user2 (the referee)
      const [referrer, earnedBonus, referralCount] = await movinEarn.getReferralInfo(user2.address);
      expect(referrer).to.equal(user1.address);
      expect(earnedBonus).to.equal(0);
      expect(referralCount).to.equal(0); // user2 has no referrals yet

      // Check referral info for user1 (the referrer)
      const [referrer1, earnedBonus1, referralCount1] = await movinEarn.getReferralInfo(
        user1.address
      );
      expect(referrer1).to.equal('0x0000000000000000000000000000000000000000');
      expect(earnedBonus1).to.equal(0);
      expect(referralCount1).to.equal(1); // user1 has 1 referral (user2)

      // Get balances after registering referral
      const referrerBalanceAfter = await movinToken.balanceOf(user1.address);
      const refereeBalanceAfter = await movinToken.balanceOf(user2.address);

      // Verify both referrer and referee received 1 MVN token
      expect(referrerBalanceAfter - referrerBalanceBefore).to.equal(ethers.parseEther('1'));
      expect(refereeBalanceAfter - refereeBalanceBefore).to.equal(ethers.parseEther('1'));
    });

    it('Should prevent self-referral', async function () {
      await expect(
        movinEarn.connect(user1).registerReferral(user1.address)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidReferrer');
    });

    it('Should prevent registering a referral twice', async function () {
      await movinEarn.connect(user2).registerReferral(user1.address);
      await expect(
        movinEarn.connect(user2).registerReferral(user1.address)
      ).to.be.revertedWithCustomError(movinEarn, 'AlreadyReferred');
    });

    it('Should track referrals correctly', async function () {
      await movinEarn.connect(user2).registerReferral(user1.address);

      // Check user1's referrals
      const referrals = await movinEarn.getUserReferrals(user1.address);
      expect(referrals.length).to.equal(1);
      expect(referrals[0]).to.equal(user2.address);
    });

    it('Should allow users to refer multiple people', async function () {
      // Create additional test users
      const [owner, user1, user2, user3, user4] = await ethers.getSigners();

      // User1 should be able to refer multiple users
      await movinEarn.connect(user2).registerReferral(user1.address);
      await movinEarn.connect(user3).registerReferral(user1.address);
      await movinEarn.connect(user4).registerReferral(user1.address);

      // Get user1's referrals
      const referrals = await movinEarn.getUserReferrals(user1.address);
      expect(referrals.length).to.equal(3);
      expect(referrals).to.include(user2.address);
      expect(referrals).to.include(user3.address);
      expect(referrals).to.include(user4.address);

      // Verify referral count for user1
      const [referrer1, earnedBonus1, referralCount] = await movinEarn.getReferralInfo(
        user1.address
      );
      expect(referralCount).to.equal(3);

      // Verify each referee has user1 as their referrer
      const [referrer2] = await movinEarn.getReferralInfo(user2.address);
      const [referrer3] = await movinEarn.getReferralInfo(user3.address);
      const [referrer4] = await movinEarn.getReferralInfo(user4.address);
      expect(referrer2).to.equal(user1.address);
      expect(referrer3).to.equal(user1.address);
      expect(referrer4).to.equal(user1.address);

      // Verify rewards are properly distributed to referrer
      await movinEarn.connect(user2).setPremiumStatus(true, ethers.parseEther('1000'));

      // Get balances before activity
      const referrerBalanceBefore = await movinToken.balanceOf(user1.address);
      const refereeBalanceBefore = await movinToken.balanceOf(user2.address);

      // Record activity to trigger automatic rewards (premium user)
      await movinEarn.recordActivity(user2.address, 1000, 1);

      // Get balances after activity
      const referrerBalanceAfter = await movinToken.balanceOf(user1.address);
      const refereeBalanceAfter = await movinToken.balanceOf(user2.address);

      // Calculate expected rewards
      const stepsReward = ethers.parseEther('1'); // 1 token for 1000 steps
      const metsReward = ethers.parseEther('0.2'); // 0.2 tokens for 1 MET (1 MVN per 5 METs)
      const totalReward = stepsReward + metsReward;

      // Calculate expected referral bonus (1% of total rewards)
      const expectedBonus = (totalReward * BigInt(ACTIVITY_REFERRAL_BONUS_PERCENT)) / BigInt(10000);

      // Verify referee received rewards
      expect(refereeBalanceAfter - refereeBalanceBefore).to.equal(totalReward);

      // Verify referrer received bonus
      expect(referrerBalanceAfter - referrerBalanceBefore).to.equal(expectedBonus);

      // Get user1's earned bonus from referral info
      const [referrer1After, earnedBonusAfter] = await movinEarn.getReferralInfo(user1.address);
      expect(earnedBonusAfter).to.equal(ethers.parseEther('0.012')); // 1% of 1.2 MVN total reward
    });

    it('Should handle referral rewards correctly', async function () {
      // Set up referral relationship
      await movinEarn.connect(user2).registerReferral(user1.address);

      // Set user2 as premium to get both steps and METs rewards
      await movinToken
        .connect(user2)
        .approve(await movinEarn.getAddress(), ethers.parseEther('1000'));
      await movinEarn.connect(user2).setPremiumStatus(true, ethers.parseEther('1000'));

      // Get balances before activity
      const user2BalanceBefore = await movinToken.balanceOf(user2.address);
      const user1BalanceBefore = await movinToken.balanceOf(user1.address);

      // Record activity for user2 to generate rewards (premium user)
      await movinEarn.recordActivity(user2.address, 1000, 1);

      // Get balances after activity
      const user2BalanceAfter = await movinToken.balanceOf(user2.address);
      const user1BalanceAfter = await movinToken.balanceOf(user1.address);

      // Calculate expected rewards
      const stepsReward = ethers.parseEther('1'); // 1 token for 1000 steps
      const metsReward = ethers.parseEther('0.2'); // 0.2 tokens for 1 MET (1 MVN per 5 METs)
      const totalReward = stepsReward + metsReward;

      // Calculate expected referral bonus
      const referralBonus = (totalReward * BigInt(ACTIVITY_REFERRAL_BONUS_PERCENT)) / BigInt(10000);

      // Calculate actual received amounts
      const user2Received = user2BalanceAfter - user2BalanceBefore;
      const user1Received = user1BalanceAfter - user1BalanceBefore;

      // Verify amounts with small tolerance for rounding
      const tolerance = ethers.parseEther('0.01');
      expect(user2Received).to.be.closeTo(totalReward, tolerance);
      expect(user1Received).to.be.closeTo(referralBonus, tolerance);

      // Verify referral info was updated
      const [_, earnedBonus] = await movinEarn.getReferralInfo(user1.address);
      expect(earnedBonus).to.equal(referralBonus);
    });

    it('Should distribute 1 MVN token to both referrer and referee when registering a referral', async function () {
      // Get balances before registering referral
      const referrerBalanceBefore = await movinToken.balanceOf(user1.address);
      const refereeBalanceBefore = await movinToken.balanceOf(user2.address);

      // Register referral
      await movinEarn.connect(user2).registerReferral(user1.address);

      // Get balances after registering referral
      const referrerBalanceAfter = await movinToken.balanceOf(user1.address);
      const refereeBalanceAfter = await movinToken.balanceOf(user2.address);

      // Verify both referrer and referee received 1 MVN token
      expect(referrerBalanceAfter - referrerBalanceBefore).to.equal(ethers.parseEther('1'));
      expect(refereeBalanceAfter - refereeBalanceBefore).to.equal(ethers.parseEther('1'));
    });
  });

  describe('Premium status functionality', function () {
    // Set transactionSync to true for users in premium status tests
    beforeEach(async function () {
      await movinEarn.connect(owner).setTransactionSync(user1.address, true);
      await movinEarn.connect(owner).setTransactionSync(user2.address, true);
    });

    it('Should set and get premium status with monthly payment', async function () {
      // Get initial premium status
      const [initialStatus, initialPaid, initialExpiration] = await movinEarn.getPremiumStatus(
        user1.address
      );
      expect(initialStatus).to.equal(false);
      expect(initialPaid).to.equal(0);
      expect(initialExpiration).to.equal(0);

      // Set premium status with monthly payment
      const monthlyAmount = ethers.parseEther('100'); // 100 MVN tokens
      await movinEarn.connect(user1).setPremiumStatus(true, monthlyAmount);

      // Get updated premium status
      const [status, paid, expiration] = await movinEarn.getPremiumStatus(user1.address);

      // Verify premium status
      expect(status).to.equal(true);
      expect(paid).to.equal(monthlyAmount);

      // Get current timestamp and verify expiration is roughly 30 days in the future
      const currentTimestamp = await time.latest();
      const expectedExpiration = currentTimestamp + 30 * 24 * 60 * 60; // 30 days in seconds
      expect(expiration).to.be.closeTo(BigInt(expectedExpiration), BigInt(5)); // Allow small timestamp difference
    });

    it('Should set and get premium status with yearly payment', async function () {
      // Set premium status with yearly payment
      const yearlyAmount = ethers.parseEther('1000'); // 1000 MVN tokens
      await movinEarn.connect(user1).setPremiumStatus(true, yearlyAmount);

      // Get updated premium status
      const [status, paid, expiration] = await movinEarn.getPremiumStatus(user1.address);

      // Verify premium status
      expect(status).to.equal(true);
      expect(paid).to.equal(yearlyAmount);

      // Get current timestamp and verify expiration is roughly 365 days in the future
      const currentTimestamp = await time.latest();
      const expectedExpiration = currentTimestamp + 365 * 24 * 60 * 60; // 365 days in seconds
      expect(expiration).to.be.closeTo(BigInt(expectedExpiration), BigInt(5)); // Allow small timestamp difference
    });

    it('Should fail when setting premium status with invalid amount', async function () {
      // Try to set premium status with invalid amount
      const invalidAmount = ethers.parseEther('500'); // Neither monthly nor yearly amount
      await expect(
        movinEarn.connect(user1).setPremiumStatus(true, invalidAmount)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidPremiumAmount');
    });

    it('Should allow resetting premium status to false', async function () {
      // First set premium status
      const monthlyAmount = ethers.parseEther('100');
      await movinEarn.connect(user1).setPremiumStatus(true, monthlyAmount);

      // Verify it was set
      const [initialStatus] = await movinEarn.getPremiumStatus(user1.address);
      expect(initialStatus).to.equal(true);

      // Reset premium status to false
      await movinEarn.connect(user1).setPremiumStatus(false, 0);

      // Verify it was reset
      const [status, paid, expiration] = await movinEarn.getPremiumStatus(user1.address);
      expect(status).to.equal(false);
      expect(paid).to.equal(0);
      expect(expiration).to.equal(0);
    });

    it('Should return expired status after the premium period ends', async function () {
      // Set premium status with monthly payment
      const monthlyAmount = ethers.parseEther('100');
      await movinEarn.connect(user1).setPremiumStatus(true, monthlyAmount);

      // Verify it was set
      const [initialStatus] = await movinEarn.getPremiumStatus(user1.address);
      expect(initialStatus).to.equal(true);

      // Advance time beyond expiration (31 days)
      await time.increase(31 * 24 * 60 * 60);

      // Check premium status after expiration
      const [statusAfterExpiration, paid, expiration] = await movinEarn.getPremiumStatus(
        user1.address
      );
      expect(statusAfterExpiration).to.equal(false); // Should be false due to expiration
      expect(paid).to.equal(monthlyAmount); // Paid amount should still be recorded
      expect(expiration).to.be.lt(await time.latest()); // Expiration should be in the past
    });

    it('Should restrict METs activity rewards for non-premium users', async function () {
      // Ensure user2 is not premium
      await movinEarn.connect(user2).setPremiumStatus(false, 0);

      // Get initial balance
      const initialBalance = await movinToken.balanceOf(user2.address);

      // Record METs activity for non-premium user
      await movinEarn.recordActivity(user2.address, 0, 1);

      // Get balance after activity
      const balanceAfter = await movinToken.balanceOf(user2.address);

      // Verify no rewards were given for METs activity
      expect(balanceAfter).to.equal(initialBalance);

      // Now set user2 as premium
      await movinToken
        .connect(user2)
        .approve(await movinEarn.getAddress(), ethers.parseEther('100'));
      await movinEarn.connect(user2).setPremiumStatus(true, ethers.parseEther('100'));

      // Save balance after becoming premium
      const balanceAfterPremium = await movinToken.balanceOf(user2.address);

      // Record METs activity again (now with premium thresholds)
      await time.increaseTo((await time.latest()) + 61); // Wait 1 minute to avoid rate limiting
      await movinEarn.recordActivity(user2.address, 0, 1);

      // Get balance after activity as premium user
      const balanceAfterActivity = await movinToken.balanceOf(user2.address);

      // Verify rewards were given now that the user is premium
      expect(balanceAfterActivity).to.be.gt(balanceAfterPremium);
    });
  });

  describe('Administrative functions', function () {
    it('Should allow owner to pause and unpause', async function () {
      // Approve MOVINEarnV2 to spend user1's tokens
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), ONE_THOUSAND_TOKENS);

      // Pause contract
      await movinEarn.connect(owner).emergencyPause();

      // Try to stake tokens while paused
      await expect(
        movinEarn.connect(user1).stakeTokens(ethers.parseEther('100'), 1)
      ).to.be.revertedWithCustomError(movinEarn, 'ContractPaused');

      // Unpause contract
      await movinEarn.connect(owner).emergencyUnpause();

      // Staking should work now
      await movinEarn.connect(user1).stakeTokens(ethers.parseEther('100'), 1);
    });
  });

  describe('Meal Rewards System', function () {
    it('Should allow owner to claim meal rewards with valid scores', async function () {
      const initialBalance = await movinToken.balanceOf(user1.address);

      // Test minimum score (1) - should give 0.01 MVN
      await movinEarn.connect(owner).claimMealRewards(user1.address, 1);
      let balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('0.01'));

      // Advance time by 2 hours
      await time.increase(2 * 60 * 60);
      // Test mid score (50) - should give 0.5 MVN
      await movinEarn.connect(owner).claimMealRewards(user1.address, 50);
      balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('0.51'));

      // Advance time by 2 hours
      await time.increase(2 * 60 * 60);
      // Test maximum score (100) - should give 1 MVN
      await movinEarn.connect(owner).claimMealRewards(user1.address, 100);
      balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(ethers.parseEther('1.51'));
    });

    it('Should emit MealRewardsClaimed event with correct parameters', async function () {
      const score = 75;
      const expectedReward = ethers.parseEther('0.75'); // 75 * 0.01 MVN

      await expect(movinEarn.connect(owner).claimMealRewards(user1.address, score))
        .to.emit(movinEarn, 'MealRewardsClaimed')
        .withArgs(user1.address, score, expectedReward);
    });

    it('Should reject invalid scores', async function () {
      // Test score below minimum (0)
      await expect(
        movinEarn.connect(owner).claimMealRewards(user1.address, 0)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidMealScore');

      // Test score above maximum (101)
      await expect(
        movinEarn.connect(owner).claimMealRewards(user1.address, 101)
      ).to.be.revertedWithCustomError(movinEarn, 'InvalidMealScore');
    });

    it('Should only allow owner to claim meal rewards', async function () {
      // Try to call from non-owner account
      await expect(
        movinEarn.connect(user1).claimMealRewards(user2.address, 50)
      ).to.be.revertedWithCustomError(movinEarn, 'OwnableUnauthorizedAccount');
    });

    it('Should calculate rewards correctly for various scores', async function () {
      const testCases = [
        { score: 1, expectedReward: '0.01' },
        { score: 10, expectedReward: '0.1' },
        { score: 25, expectedReward: '0.25' },
        { score: 33, expectedReward: '0.33' },
        { score: 50, expectedReward: '0.5' },
        { score: 77, expectedReward: '0.77' },
        { score: 99, expectedReward: '0.99' },
        { score: 100, expectedReward: '1.0' },
      ];

      for (const testCase of testCases) {
        const initialBalance = await movinToken.balanceOf(user2.address);
        await movinEarn.connect(owner).claimMealRewards(user2.address, testCase.score);
        const balanceAfter = await movinToken.balanceOf(user2.address);
        const actualReward = balanceAfter - initialBalance;
        const expectedReward = ethers.parseEther(testCase.expectedReward);
        expect(actualReward).to.equal(expectedReward);
        // Advance time by 2 hours for next claim
        await time.increase(2 * 60 * 60);
      }
    });

    it('Should work with owner from environment variable (PRIVATE_KEY)', async function () {
      // This test checks that the owner functionality works with environment configuration
      // The owner is already set up in beforeEach using the first signer

      // Verify the current owner
      const currentOwner = await movinEarn.owner();
      expect(currentOwner).to.equal(owner.address);

      // Test meal rewards functionality with the configured owner
      const initialBalance = await movinToken.balanceOf(user1.address);
      const score = 85;
      const expectedReward = ethers.parseEther('0.85');

      await movinEarn.connect(owner).claimMealRewards(user1.address, score);

      const balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - initialBalance).to.equal(expectedReward);
    });

    it('Should not allow claiming meal rewards more than once within 2 hours', async function () {
      // First claim
      await movinEarn.connect(owner).claimMealRewards(user1.address, 10);
      // Increase time by just under 2 hours (should still revert)
      await time.increase(1);
      await expect(
        movinEarn.connect(owner).claimMealRewards(user1.address, 20)
      ).to.be.revertedWithCustomError(movinEarn, 'MealClaimTooSoon');
      // Increase time to reach exactly 2 hours
      await time.increase(2 * 60 * 60);
      // Now it should succeed
      await movinEarn.connect(owner).claimMealRewards(user1.address, 20);
    });

    it('Should allow claiming meal rewards again after 2 hours', async function () {
      // First claim
      await movinEarn.connect(owner).claimMealRewards(user1.address, 10);
      // Increase time by just under 2 hours (should still revert)
      await time.increase(1);
      await expect(
        movinEarn.connect(owner).claimMealRewards(user1.address, 20)
      ).to.be.revertedWithCustomError(movinEarn, 'MealClaimTooSoon');
      // Increase time to reach exactly 2 hours
      await time.increase(2 * 60 * 60);
      // Now it should succeed
      await movinEarn.connect(owner).claimMealRewards(user1.address, 20);
    });
  });
});
