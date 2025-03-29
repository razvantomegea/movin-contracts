import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MOVINEarnV2, MovinToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { EventLog, Log } from "ethers";

describe("MOVINEarnV2", function () {
  let movinToken: MovinToken;
  let movinEarn: MOVINEarnV2;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let migrator: HardhatEthersSigner;

  // Constants
  const STEPS_THRESHOLD = 10_000;
  const METS_THRESHOLD = 10;
  const MAX_DAILY_STEPS = 25_000;
  const MAX_DAILY_METS = 50;
  const ONE_TOKEN = ethers.parseEther("1");
  const ONE_THOUSAND_TOKENS = ethers.parseEther("1000");
  const REWARDS_BURN_FEES_PERCENT = 1;
  const ACTIVITY_REFERRAL_BONUS_PERCENT = 1;
  const ONE_DAY = 24 * 60 * 60;
  const THIRTY_DAYS = 30 * ONE_DAY;
  const ONE_YEAR = 365 * ONE_DAY;

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, migrator] = await ethers.getSigners();

    // Deploy MovinToken
    const MovinToken = await ethers.getContractFactory("MovinToken");
    movinToken = await upgrades.deployProxy(
      MovinToken,
      [owner.address],
      { kind: "uups", initializer: "initialize" }
    ) as unknown as MovinToken;
    await movinToken.waitForDeployment();

    // Deploy MOVINEarnV2
    const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
    movinEarn = await upgrades.deployProxy(
      MOVINEarnV2,
      [await movinToken.getAddress()],
      { kind: "uups", initializer: "initialize" }
    ) as unknown as MOVINEarnV2;
    await movinEarn.waitForDeployment();

    // Mint some tokens to users for testing
    await movinToken.mint(user1.address, ONE_THOUSAND_TOKENS);
    await movinToken.mint(user2.address, ONE_THOUSAND_TOKENS);
    
    // Also mint tokens to the MOVINEarnV2 contract for rewards distribution
    await movinToken.mint(await movinEarn.getAddress(), ethers.parseEther("100000"));
  });

  describe("Initialization", function () {
    it("Should initialize with correct values", async function () {
      expect(await movinEarn.movinToken()).to.equal(await movinToken.getAddress());
      expect(await movinEarn.owner()).to.equal(owner.address);
      
      // Check lock period multipliers
      expect(await movinEarn.lockPeriodMultipliers(1)).to.equal(1);
      expect(await movinEarn.lockPeriodMultipliers(3)).to.equal(3);
      expect(await movinEarn.lockPeriodMultipliers(6)).to.equal(6);
      expect(await movinEarn.lockPeriodMultipliers(12)).to.equal(12);
      expect(await movinEarn.lockPeriodMultipliers(24)).to.equal(24);
      
      // Check reward rates
      expect(await movinEarn.baseStepsRate()).to.equal(ethers.parseEther("1"));
      expect(await movinEarn.baseMetsRate()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Staking functionality", function () {
    beforeEach(async function () {
      // Approve MOVINEarnV2 to spend user1's tokens
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), ONE_THOUSAND_TOKENS);
    });

    it("Should allow staking tokens with various lock periods", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // Test each valid lock period
      const lockPeriods = [1, 3, 6, 12, 24];
      
      for (let i = 0; i < lockPeriods.length; i++) {
        const lockPeriod = lockPeriods[i];
        
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

    it("Should fail when staking with invalid lock period", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // Try to stake with invalid lock period
      await expect(movinEarn.connect(user1).stakeTokens(stakeAmount, 2))
        .to.be.revertedWithCustomError(movinEarn, "InvalidLockPeriod");
    });

    it("Should fail when staking zero amount", async function () {
      await expect(movinEarn.connect(user1).stakeTokens(0, 1))
        .to.be.revertedWithCustomError(movinEarn, "ZeroAmountNotAllowed");
    });

    it("Should calculate staking rewards correctly", async function () {
      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 12; // 12 months, which has a multiplier of 12
      
      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
      
      // Advance time by 30 days
      await time.increase(THIRTY_DAYS);
      
      // Calculate expected reward
      // Formula: (amount * apr * effectiveDuration) / (100 * 365 days)
      const apr = 12; // Multiplier for 12 months
      const expectedReward = (stakeAmount * BigInt(apr) * BigInt(THIRTY_DAYS)) / 
                             (BigInt(100) * BigInt(ONE_YEAR));
      
      // Get calculated reward from contract
      const reward = await movinEarn.connect(user1).calculateStakingReward(0);
      
      // Allow for small rounding difference due to timestamp variations
      const difference = expectedReward > reward ? 
                         expectedReward - reward : 
                         reward - expectedReward;
                         
      expect(difference).to.be.lessThan(ethers.parseEther("0.01"));
    });

    it("Should allow claiming staking rewards without referral bonus", async function () {
      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 12; // 12 months
      
      // Setup referral relationship
      await movinEarn.connect(user2).registerReferral(user1.address);
      
      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
      
      // Advance time by 30 days
      await time.increase(THIRTY_DAYS);
      
      // Get user balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      const referrerBalanceBefore = await movinToken.balanceOf(user2.address);
      
      // Calculate expected reward
      const reward = await movinEarn.connect(user1).calculateStakingReward(0);
      const burnAmount = (reward * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedReward = reward - burnAmount;
      
      // Claim rewards
      const tx = await movinEarn.connect(user1).claimStakingRewards(0);
      const receipt = await tx.wait();
      
      // Verify balance increased for user1
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualReward = balanceAfter - balanceBefore;
      
      // Verify no change in balance for referrer
      const referrerBalanceAfter = await movinToken.balanceOf(user2.address);
      
      // Use tolerance comparison instead of exact equality
      const rewardDifference = expectedReward > actualReward ? 
                               expectedReward - actualReward : 
                               actualReward - expectedReward;
                               
      expect(rewardDifference).to.be.lessThan(ethers.parseEther("0.01"));
      expect(referrerBalanceAfter).to.equal(referrerBalanceBefore);
    });

    it("Should allow claiming rewards from all stakes at once using claimAllStakingRewards", async function () {
      // Mint enough tokens for staking
      await movinToken.mint(user1.address, ethers.parseEther("10000"));
      
      // Create multiple stakes with different lock periods
      const stake1Amount = ethers.parseEther("1000");
      const stake2Amount = ethers.parseEther("1500");
      const stake3Amount = ethers.parseEther("2000");
      
      // Approve tokens for staking
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), 
        stake1Amount + stake2Amount + stake3Amount);
      
      // Create 3 different stakes
      await movinEarn.connect(user1).stakeTokens(stake1Amount, 1); // 1 month
      await movinEarn.connect(user1).stakeTokens(stake2Amount, 3); // 3 months
      await movinEarn.connect(user1).stakeTokens(stake3Amount, 6); // 6 months
      
      // Advance time by 15 days to accumulate some rewards
      await time.increase(15 * 24 * 60 * 60);
      
      // Calculate total expected rewards
      let totalExpectedReward = BigInt(0);
      const stakeCount = await movinEarn.connect(user1).getUserStakeCount();
      
      for (let i = 0; i < stakeCount; i++) {
        const stakeReward = await movinEarn.connect(user1).calculateStakingReward(i);
        totalExpectedReward += stakeReward;
      }
      
      // Calculate expected burn and user reward
      const burnAmount = (totalExpectedReward * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedUserReward = totalExpectedReward - burnAmount;
      
      // Get user balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      
      // Make sure rewards are claimed successfully
      const tx = await movinEarn.connect(user1).claimAllStakingRewards();
      await tx.wait();
      
      // Ensure all rewards are now zero
      let allRewardsZero = true;
      for (let i = 0; i < stakeCount; i++) {
        const rewardAfterClaim = await movinEarn.connect(user1).calculateStakingReward(i);
        if (rewardAfterClaim > 0) {
          allRewardsZero = false;
          console.log(`Stake ${i} still has rewards: ${ethers.formatEther(rewardAfterClaim)}`);
        }
      }
      expect(allRewardsZero).to.be.true;
      
      // Try claiming again immediately - should revert with NoRewardsAvailable
      // Force an evm mine to ensure timestamps are truly updated
      await ethers.provider.send("evm_mine", []);
      
      // Verify that rewards are below the minimum threshold (0.001 MOVIN)
      let totalRewardsBeforeSecondClaim = 0n;
      for (let i = 0; i < stakeCount; i++) {
        const reward = await movinEarn.connect(user1).calculateStakingReward(i);
        totalRewardsBeforeSecondClaim += reward;
      }
      
      expect(totalRewardsBeforeSecondClaim).to.be.lessThan(ethers.parseEther("0.001"));
      console.log(`Total rewards after first claim: ${ethers.formatEther(totalRewardsBeforeSecondClaim)} MOVIN`);
      console.log(`This is below the minimum threshold of 0.001 MOVIN, so claim should fail`);
      
      // Now try claiming again (should fail with NoRewardsAvailable)
      await expect(movinEarn.connect(user1).claimAllStakingRewards())
        .to.be.revertedWithCustomError(movinEarn, "NoRewardsAvailable");
      
      // Verify stake timestamps are still up to date
      const blockAfter = await ethers.provider.getBlock("latest");
      const currentTimestamp = blockAfter ? blockAfter.timestamp : 0;
      
      for (let i = 0; i < stakeCount; i++) {
        const stake = await movinEarn.connect(user1).getUserStake(i);
        expect(stake.lastClaimed).to.be.closeTo(
          BigInt(currentTimestamp), 
          BigInt(10)
        );
      }
    });

    it("Should enforce lock period when unstaking", async function () {
      const stakeAmount = ethers.parseEther("100");
      const lockPeriod = 1; // 1 month
      
      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
      
      // Try to unstake before lock period ends
      await expect(movinEarn.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(movinEarn, "LockPeriodActive");
      
      // Advance time past lock period
      await time.increase(THIRTY_DAYS + 1);
      
      // Get user balance before unstaking
      const balanceBefore = await movinToken.balanceOf(user1.address);
      
      // Calculate burn amount
      const burnAmount = (stakeAmount * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedReturn = stakeAmount - burnAmount;
      
      // Unstake tokens
      await expect(movinEarn.connect(user1).unstake(0))
        .to.emit(movinEarn, "Unstaked")
        .withArgs(user1.address, stakeAmount, 0);
      
      // Verify balance increased
      const balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedReturn);
      
      // Verify stake was removed
      expect(await movinEarn.connect(user1).getUserStakeCount()).to.equal(0);
    });
  });

  describe("Activity recording and rewards", function () {
    beforeEach(async function () {
      // Set user1 as premium
      await movinEarn.connect(owner).setPremiumStatus(user1.address, true);
    });

    it("Should record activity correctly", async function () {
      const steps = 8000;
      const mets = 5;
      
      // Record activity
      await movinEarn.connect(user1).recordActivity(steps, mets);
      
      // Check recorded activity
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(steps);
      expect(recordedMets).to.equal(mets);
    });

    it("Should accumulate activity correctly", async function () {
      // Record activity in parts
      await movinEarn.connect(user1).recordActivity(5000, 3);
      await movinEarn.connect(user1).recordActivity(7000, 4);
      
      // Check total recorded activity
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(12000);
      expect(recordedMets).to.equal(7);
    });

    it("Should apply activity referral bonus correctly", async function () {
      // Register referral relationship
      await movinEarn.connect(user2).registerReferral(user1.address);
      
      // Set user1 and user2 as premium
      await movinEarn.connect(owner).setPremiumStatus(user1.address, true);
      await movinEarn.connect(owner).setPremiumStatus(user2.address, true);
      
      // Record activity with step values that will give integer bonuses
      const steps = 10000;
      const mets = 0; // Using 0 METs to stay within limits
      const expectedStepsBonus = steps * ACTIVITY_REFERRAL_BONUS_PERCENT / 100;
      const expectedMetsBonus = 0; // 0 METs results in 0 bonus
      
      // Record activity for user2
      await expect(movinEarn.connect(user2).recordActivity(steps, mets))
        .to.emit(movinEarn, "ActivityReferralBonusEarned")
        .withArgs(user1.address, user2.address, expectedStepsBonus, expectedMetsBonus);
      
      // Check referrer's (user1) activity includes the bonus
      const [referrerSteps, referrerMets] = await movinEarn.connect(user1).getUserActivity();
      expect(referrerSteps).to.equal(expectedStepsBonus);
      expect(referrerMets).to.equal(expectedMetsBonus);
    });

    it("Should not exceed max daily values when applying referral bonus", async function () {
      // Register multiple referrals to user1
      await movinEarn.connect(user2).registerReferral(user1.address);
      
      // Create a scenario where referral bonuses would exceed max daily limits
      const highSteps = MAX_DAILY_STEPS - 100; // Almost at the limit
      
      // First set some activity for user1
      await movinEarn.connect(user1).recordActivity(highSteps, 0);
      
      // Now user2 records high activity that would push user1 over the limit with bonus
      await movinEarn.connect(user2).recordActivity(20000, 0);
      
      // Check user1's activity is capped at maximum
      const [referrerSteps, _] = await movinEarn.connect(user1).getUserActivity();
      expect(referrerSteps).to.equal(MAX_DAILY_STEPS);
    });

    it("Should check rewards can be claimed without referral bonus", async function () {
      // Set up a referral relationship
      await movinEarn.connect(user2).registerReferral(user1.address);
      
      // Record activity that accumulates rewards for user2
      await movinEarn.connect(user2).recordActivity(STEPS_THRESHOLD * 2, METS_THRESHOLD * 2);
      
      // Get expected rewards
      const [stepsReward, metsReward] = await movinEarn.connect(user2).getPendingRewards();
      const totalReward = stepsReward + metsReward;
      const burnAmount = (totalReward * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedReward = totalReward - burnAmount;
      
      // Get balances before claiming
      const userBalanceBefore = await movinToken.balanceOf(user2.address);
      const referrerBalanceBefore = await movinToken.balanceOf(user1.address);
      
      // Claim rewards
      await movinEarn.connect(user2).claimRewards();
      
      // Check balance after claiming
      const userBalanceAfter = await movinToken.balanceOf(user2.address);
      const referrerBalanceAfter = await movinToken.balanceOf(user1.address);
      
      // Verify user got their reward
      const actualReward = userBalanceAfter - userBalanceBefore;
      expect(actualReward).to.equal(expectedReward);
      
      // Verify referrer did not receive a bonus
      expect(referrerBalanceAfter).to.equal(referrerBalanceBefore);
    });
  });

  describe("Daily reward rate decrease", function () {
    it("Should decrease rewards rate by 1% each day", async function () {
      const initialStepsRate = await movinEarn.baseStepsRate();
      const initialMetsRate = await movinEarn.baseMetsRate();
      
      // Advance time by one day
      await time.increase(ONE_DAY + 1);
      
      // Trigger the decrease by recording activity
      await movinEarn.connect(user1).recordActivity(1000, 1);
      
      // Check that rates were decreased by 1%
      const newStepsRate = await movinEarn.baseStepsRate();
      const newMetsRate = await movinEarn.baseMetsRate();
      
      const expectedStepsRate = (initialStepsRate * BigInt(99)) / BigInt(100);
      const expectedMetsRate = (initialMetsRate * BigInt(99)) / BigInt(100);
      
      expect(newStepsRate).to.equal(expectedStepsRate);
      expect(newMetsRate).to.equal(expectedMetsRate);
    });
    
    it("Should apply multiple days of decrease when time passes", async function () {
      const initialStepsRate = await movinEarn.baseStepsRate();
      
      // Advance time by three days
      await time.increase(ONE_DAY * 3 + 1);
      
      // Trigger the decrease by recording activity
      await movinEarn.connect(user1).recordActivity(1000, 1);
      
      // Check that rates were decreased by 1% compounded for 3 days
      const newStepsRate = await movinEarn.baseStepsRate();
      
      let expectedStepsRate = initialStepsRate;
      for (let i = 0; i < 3; i++) {
        expectedStepsRate = (expectedStepsRate * BigInt(99)) / BigInt(100);
      }
      
      expect(newStepsRate).to.equal(expectedStepsRate);
    });
  });

  describe("Referral system", function () {
    it("Should register referrals correctly", async function () {
      // Register referral
      await expect(movinEarn.connect(user2).registerReferral(user1.address))
        .to.emit(movinEarn, "ReferralRegistered")
        .withArgs(user2.address, user1.address);
      
      // Check referral info
      const [referrer, earnedBonus, referralCount] = await movinEarn.getReferralInfo(user2.address);
      expect(referrer).to.equal(user1.address);
      expect(earnedBonus).to.equal(0);
      expect(referralCount).to.equal(0);
      
      // Check user1's referrals
      const referrals = await movinEarn.getUserReferrals(user1.address);
      expect(referrals.length).to.equal(1);
      expect(referrals[0]).to.equal(user2.address);
    });

    it("Should not allow self-referral", async function () {
      await expect(movinEarn.connect(user1).registerReferral(user1.address))
        .to.be.revertedWithCustomError(movinEarn, "InvalidReferrer");
    });

    it("Should not allow registering referral twice", async function () {
      // Register first referral
      await movinEarn.connect(user2).registerReferral(user1.address);
      
      // Try to register another referral
      await expect(movinEarn.connect(user2).registerReferral(owner.address))
        .to.be.revertedWithCustomError(movinEarn, "AlreadyReferred");
    });
  });

  describe("Administrative functions", function () {
    it("Should allow owner to pause and unpause", async function () {
      // Approve MOVINEarnV2 to spend user1's tokens
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), ONE_THOUSAND_TOKENS);
      
      // Pause contract
      await movinEarn.connect(owner).emergencyPause();
      
      // Try to stake tokens while paused
      await expect(movinEarn.connect(user1).stakeTokens(ethers.parseEther("100"), 1))
        .to.be.revertedWithCustomError(movinEarn, "ContractPaused");
      
      // Unpause contract
      await movinEarn.connect(owner).emergencyUnpause();
      
      // Staking should work now
      await movinEarn.connect(user1).stakeTokens(ethers.parseEther("100"), 1);
    });

    it("Should only allow owner to set premium status", async function () {
      // Verify initial premium status is false
      expect(await movinEarn.getIsPremiumUser(user2.address)).to.equal(false);
      
      // Try to set premium status as non-owner (should fail)
      await expect(movinEarn.connect(user1).setPremiumStatus(user2.address, true))
        .to.be.reverted; // Will revert with an Ownable error
      
      // Verify status didn't change
      expect(await movinEarn.getIsPremiumUser(user2.address)).to.equal(false);
      
      // Set premium status as owner (should succeed)
      await expect(movinEarn.connect(owner).setPremiumStatus(user2.address, true))
        .to.emit(movinEarn, "PremiumStatusChanged")
        .withArgs(user2.address, true);
      
      // Verify status changed
      expect(await movinEarn.getIsPremiumUser(user2.address)).to.equal(true);
      
      // Change status back as owner
      await movinEarn.connect(owner).setPremiumStatus(user2.address, false);
      
      // Verify status changed back
      expect(await movinEarn.getIsPremiumUser(user2.address)).to.equal(false);
    });
  });
}); 