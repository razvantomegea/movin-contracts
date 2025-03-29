import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MOVINEarn, MovinToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MOVINEarn", function () {
  let movinToken: MovinToken;
  let movinEarn: MOVINEarn;
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

    // Deploy MOVINEarn
    const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
    movinEarn = await upgrades.deployProxy(
      MOVINEarn,
      [await movinToken.getAddress()],
      { kind: "uups", initializer: "initialize" }
    ) as unknown as MOVINEarn;
    await movinEarn.waitForDeployment();

    // Mint some tokens to users for testing
    await movinToken.mint(user1.address, ONE_THOUSAND_TOKENS);
    await movinToken.mint(user2.address, ONE_THOUSAND_TOKENS);
    
    // Also mint tokens to the MOVINEarn contract for rewards distribution
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
      // Approve MOVINEarn to spend user1's tokens
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

    it("Should fail when staking more than balance", async function () {
      const excessAmount = ethers.parseEther("2000"); // More than user has
      
      await expect(movinEarn.connect(user1).stakeTokens(excessAmount, 1))
        .to.be.revertedWithCustomError(movinEarn, "InsufficientBalance");
    });

    it("Should fail when staking without approval", async function () {
      // Use user2 who hasn't approved the contract
      const stakeAmount = ethers.parseEther("100");
      
      await expect(movinEarn.connect(user2).stakeTokens(stakeAmount, 1))
        .to.be.revertedWithCustomError(movinEarn, "InsufficientAllowance");
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

    it("Should allow claiming staking rewards", async function () {
      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 12; // 12 months
      
      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
      
      // Advance time by 30 days
      await time.increase(THIRTY_DAYS);
      
      // Get user balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      
      // Calculate expected reward
      const reward = await movinEarn.connect(user1).calculateStakingReward(0);
      const burnAmount = (reward * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedReward = reward - burnAmount;
      
      // Claim rewards
      const tx = await movinEarn.connect(user1).claimStakingRewards(0);
      const receipt = await tx.wait();
      
      // Get emitted event
      const rewardEvents = receipt?.logs.filter(log => {
        try {
          const parsedLog = movinEarn.interface.parseLog(log);
          return parsedLog && parsedLog.name === 'StakingRewardsClaimed';
        } catch (e) {
          return false;
        }
      }) || [];
      
      // Verify balance increased
      const balanceAfter = await movinToken.balanceOf(user1.address);
      const actualReward = balanceAfter - balanceBefore;
      
      // Use tolerance comparison instead of exact equality
      const rewardDifference = expectedReward > actualReward ? 
                               expectedReward - actualReward : 
                               actualReward - expectedReward;
                               
      expect(rewardDifference).to.be.lessThan(ethers.parseEther("0.01"));
      expect(rewardEvents.length).to.be.greaterThan(0);
    });

    it("Should allow unstaking after lock period", async function () {
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

    it("Should update lastMidnightReset correctly on every recordActivity call", async function () {
      // Get current midnight timestamp
      const now = await time.latest();
      const currentMidnight = Math.floor(now / 86400) * 86400;
      
      // Record activity
      await movinEarn.connect(user1).recordActivity(5000, 5);
      
      // Check that lastMidnightReset is set to current midnight
      const activity = await movinEarn.userActivities(user1.address);
      expect(activity.lastMidnightReset).to.equal(currentMidnight);
    });

    it("Should reset activity at midnight but keep lastMidnightReset updated", async function () {
      // Record activity
      await movinEarn.connect(user1).recordActivity(5000, 5);
      
      // Check that activity was recorded
      let [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(5000);
      expect(recordedMets).to.equal(5);
      
      // Advance time to next day (add 24 hours + 1 second)
      await time.increase(ONE_DAY + 1);
      
      // Check that getUserActivity returns zeros before new activity is recorded
      [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(0);
      expect(recordedMets).to.equal(0);
      
      // Record new activity
      await movinEarn.connect(user1).recordActivity(3000, 3);
      
      // Get new midnight timestamp
      const now = await time.latest();
      const newMidnight = Math.floor(now / 86400) * 86400;
      
      // Check that lastMidnightReset is updated to new midnight
      const activity = await movinEarn.userActivities(user1.address);
      expect(activity.lastMidnightReset).to.equal(newMidnight);
      
      // Check that only the new activity is recorded
      [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(3000);
      expect(recordedMets).to.equal(3);
    });
    
    it("Should always update lastMidnightReset even if no activity reset happens", async function () {
      // Record initial activity
      await movinEarn.connect(user1).recordActivity(5000, 5);
      
      // Record more activity in the same day
      await movinEarn.connect(user1).recordActivity(3000, 3);
      
      // Get current midnight timestamp
      const now = await time.latest();
      const currentMidnight = Math.floor(now / 86400) * 86400;
      
      // Check that lastMidnightReset is still at current midnight
      const activity = await movinEarn.userActivities(user1.address);
      expect(activity.lastMidnightReset).to.equal(currentMidnight);
      
      // Check that activity accumulated
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      expect(recordedSteps).to.equal(8000);
      expect(recordedMets).to.equal(8);
    });

    it("Should accumulate rewards when threshold is reached", async function () {
      // Record activity that exceeds thresholds
      await movinEarn.connect(user1).recordActivity(STEPS_THRESHOLD + 1000, METS_THRESHOLD + 2);
      
      // Check rewards accumulation
      const [stepsReward, metsReward] = await movinEarn.connect(user1).getPendingRewards();
      
      // Calculate expected rewards
      const expectedStepsReward = ethers.parseEther("1"); // 1 token per threshold
      const expectedMetsReward = ethers.parseEther("1"); // 1 token per threshold
      
      expect(stepsReward).to.equal(expectedStepsReward);
      expect(metsReward).to.equal(expectedMetsReward);
    });

    it("Should reject invalid activity input", async function () {
      // Try to record more than max allowed steps
      await expect(movinEarn.connect(user1).recordActivity(MAX_DAILY_STEPS + 1, 5))
        .to.be.revertedWithCustomError(movinEarn, "InvalidActivityInput");
      
      // Try to record more than max allowed mets
      await expect(movinEarn.connect(user1).recordActivity(1000, MAX_DAILY_METS + 1))
        .to.be.revertedWithCustomError(movinEarn, "InvalidActivityInput");
    });

    it("Should only record mets for premium users", async function () {
      // Regular user should not accumulate mets
      await movinEarn.connect(user2).recordActivity(5000, 5);
      
      // Check activity for regular user
      const [, recordedMets] = await movinEarn.connect(user2).getUserActivity();
      expect(recordedMets).to.equal(0);
    });

    it("Should allow claiming rewards", async function () {
      // Record activity that accumulates rewards
      await movinEarn.connect(user1).recordActivity(STEPS_THRESHOLD * 2, METS_THRESHOLD * 2);
      
      // Get expected rewards
      const [stepsReward, metsReward] = await movinEarn.connect(user1).getPendingRewards();
      const totalReward = stepsReward + metsReward;
      const burnAmount = (totalReward * BigInt(REWARDS_BURN_FEES_PERCENT)) / BigInt(100);
      const expectedReward = totalReward - burnAmount;
      
      // Get balance before claiming
      const balanceBefore = await movinToken.balanceOf(user1.address);
      
      // Claim rewards
      await expect(movinEarn.connect(user1).claimRewards())
        .to.emit(movinEarn, "RewardsClaimed")
        .withArgs(user1.address, stepsReward, metsReward, expectedReward);
      
      // Check balance after claiming
      const balanceAfter = await movinToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedReward);
      
      // Check that rewards were reset
      const [newStepsReward, newMetsReward] = await movinEarn.connect(user1).getPendingRewards();
      expect(newStepsReward).to.equal(0);
      expect(newMetsReward).to.equal(0);
    });

    it("Should expire rewards after 30 days", async function () {
      // Record activity that accumulates rewards
      await movinEarn.connect(user1).recordActivity(STEPS_THRESHOLD, METS_THRESHOLD);
      
      // Advance time by more than 30 days
      await time.increase(THIRTY_DAYS + ONE_DAY);
      
      // Try to claim rewards (should fail)
      await expect(movinEarn.connect(user1).claimRewards())
        .to.be.revertedWithCustomError(movinEarn, "RewardsExpired");
    });
  });

  describe("Premium status management", function () {
    it("Should allow owner to set premium status", async function () {
      // Set user1 as premium
      await expect(movinEarn.connect(owner).setPremiumStatus(user1.address, true))
        .to.emit(movinEarn, "PremiumStatusChanged")
        .withArgs(user1.address, true);
      
      // Verify premium status
      expect(await movinEarn.getIsPremiumUser(user1.address)).to.equal(true);
      
      // Set user1 back to non-premium
      await expect(movinEarn.connect(owner).setPremiumStatus(user1.address, false))
        .to.emit(movinEarn, "PremiumStatusChanged")
        .withArgs(user1.address, false);
      
      // Verify non-premium status
      expect(await movinEarn.getIsPremiumUser(user1.address)).to.equal(false);
    });

    it("Should not allow non-owner to set premium status", async function () {
      await expect(movinEarn.connect(user1).setPremiumStatus(user2.address, true))
        .to.be.reverted;
    });
  });

  describe("Migration functionality", function () {
    it("Should allow migrator to import stakes", async function () {
      // Deploy a new contract for migration purposes
      const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
      const newMovinEarn = await upgrades.deployProxy(
        MOVINEarn,
        [await movinToken.getAddress()],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MOVINEarn;
      await newMovinEarn.waitForDeployment();
      
      // Set migrator during initialization
      await newMovinEarn.connect(owner).initializeMigration(migrator.address);
      
      const stakeAmount = ethers.parseEther("100");
      const lockDuration = THIRTY_DAYS;
      const timestamp = await time.latest();
      
      // Create stake data
      const stakeData = [{
        amount: stakeAmount,
        startTime: timestamp,
        lockDuration: lockDuration,
        lastClaimed: timestamp
      }];
      
      // Import stake
      await newMovinEarn.connect(migrator).importStakes(user1.address, stakeData);
      
      // Verify imported stake
      const userStakes = await newMovinEarn.getUserStakes(user1.address);
      expect(userStakes.length).to.equal(1);
      expect(userStakes[0].amount).to.equal(stakeAmount);
      expect(userStakes[0].lockDuration).to.equal(lockDuration);
    });

    it("Should allow migrator to import activity data", async function () {
      // Deploy a new contract for migration purposes
      const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
      const newMovinEarn = await upgrades.deployProxy(
        MOVINEarn,
        [await movinToken.getAddress()],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MOVINEarn;
      await newMovinEarn.waitForDeployment();
      
      // Set migrator during initialization
      await newMovinEarn.connect(owner).initializeMigration(migrator.address);
      
      const steps = 5000;
      const mets = 5;
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Import activity data
      await newMovinEarn.connect(migrator).importActivityData(user1.address, steps, mets, timestamp);
      
      // Check activity data from userActivities mapping
      const activity = await newMovinEarn.userActivities(user1.address);
      expect(activity.dailySteps).to.equal(steps);
      expect(activity.dailyMets).to.equal(mets);
      expect(activity.lastMidnightReset).to.equal(timestamp);
    });

    it("Should allow migrator to import reward data", async function () {
      // Deploy a new contract for migration purposes
      const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
      const newMovinEarn = await upgrades.deployProxy(
        MOVINEarn,
        [await movinToken.getAddress()],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MOVINEarn;
      await newMovinEarn.waitForDeployment();
      
      // Set migrator during initialization
      await newMovinEarn.connect(owner).initializeMigration(migrator.address);
      
      const stepsReward = ethers.parseEther("10");
      const metsReward = ethers.parseEther("5");
      
      // Import reward data
      await newMovinEarn.connect(migrator).importRewardData(user1.address, stepsReward, metsReward);
      
      // Check reward data
      const [importedStepsReward, importedMetsReward] = await newMovinEarn.connect(user1).getPendingRewards();
      expect(importedStepsReward).to.equal(stepsReward);
      expect(importedMetsReward).to.equal(metsReward);
    });

    it("Should allow migrator to import premium status", async function () {
      // Deploy a new contract for migration purposes
      const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
      const newMovinEarn = await upgrades.deployProxy(
        MOVINEarn,
        [await movinToken.getAddress()],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MOVINEarn;
      await newMovinEarn.waitForDeployment();
      
      // Set migrator during initialization
      await newMovinEarn.connect(owner).initializeMigration(migrator.address);
      
      // Import premium status
      await newMovinEarn.connect(migrator).importPremiumStatus(user1.address, true);
      
      // Verify premium status
      expect(await newMovinEarn.getIsPremiumUser(user1.address)).to.equal(true);
    });

    it("Should not allow non-migrator to import data", async function () {
      // Deploy a new contract for migration purposes
      const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
      const newMovinEarn = await upgrades.deployProxy(
        MOVINEarn,
        [await movinToken.getAddress()],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MOVINEarn;
      await newMovinEarn.waitForDeployment();
      
      // Set migrator during initialization
      await newMovinEarn.connect(owner).initializeMigration(migrator.address);
      
      await expect(newMovinEarn.connect(user1).importPremiumStatus(user1.address, true))
        .to.be.reverted;
    });
  });

  describe("Administrative functions", function () {
    it("Should allow owner to pause and unpause", async function () {
      // Approve MOVINEarn to spend user1's tokens
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

    it("Should allow owner to set lock period multiplier", async function () {
      // Set a new multiplier for an existing lock period
      await movinEarn.connect(owner).setLockPeriodMultiplier(12, 15);
      
      // Verify the new multiplier
      expect(await movinEarn.lockPeriodMultipliers(12)).to.equal(15);
      
      // Set a multiplier for a new lock period
      await movinEarn.connect(owner).setLockPeriodMultiplier(36, 36);
      
      // Verify the new lock period
      expect(await movinEarn.lockPeriodMultipliers(36)).to.equal(36);
    });

    it("Should not allow non-owner to set lock period multiplier", async function () {
      await expect(movinEarn.connect(user1).setLockPeriodMultiplier(12, 15))
        .to.be.reverted;
    });

    it("Should allow owner to recover ERC20 tokens", async function () {
      // Deploy a test ERC20 token
      const TestToken = await ethers.getContractFactory("MovinToken");
      const testToken = await upgrades.deployProxy(
        TestToken,
        [owner.address],
        { kind: "uups", initializer: "initialize" }
      ) as unknown as MovinToken;
      await testToken.waitForDeployment();
      
      // Mint some test tokens to the MOVINEarn contract
      const amount = ethers.parseEther("100");
      await testToken.mint(await movinEarn.getAddress(), amount);
      
      // Get owner balance before recovery
      const ownerBalanceBefore = await testToken.balanceOf(owner.address);
      
      // Recover the tokens
      await movinEarn.connect(owner).recoverERC20(await testToken.getAddress());
      
      // Verify tokens were recovered
      const ownerBalanceAfter = await testToken.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(amount);
    });

    it("Should not allow recovering MOVIN tokens", async function () {
      await expect(movinEarn.connect(owner).recoverERC20(await movinToken.getAddress()))
        .to.be.revertedWithCustomError(movinEarn, "UnauthorizedAccess");
    });
  });

  describe("Reward halving", function () {
    it("Should halve rewards after one year", async function () {
      const initialStepsRate = await movinEarn.baseStepsRate();
      const initialMetsRate = await movinEarn.baseMetsRate();
      
      // Advance time by more than a year
      await time.increase(ONE_YEAR + ONE_DAY);
      
      // Trigger the halving by recording activity
      await movinEarn.connect(user1).recordActivity(1000, 1);
      
      // Check that rates were halved
      const newStepsRate = await movinEarn.baseStepsRate();
      const newMetsRate = await movinEarn.baseMetsRate();
      
      expect(newStepsRate).to.equal(initialStepsRate / BigInt(2));
      expect(newMetsRate).to.equal(initialMetsRate / BigInt(2));
    });
  });

  describe("Deposit functionality", function () {
    it("Should allow users to deposit tokens", async function () {
      const depositAmount = ethers.parseEther("100");
      
      // Approve the contract to spend tokens
      await movinToken.connect(user1).approve(await movinEarn.getAddress(), depositAmount);
      
      // Get contract balance before deposit
      const contractBalanceBefore = await movinToken.balanceOf(await movinEarn.getAddress());
      
      // Deposit tokens
      await expect(movinEarn.connect(user1).deposit(depositAmount))
        .to.emit(movinEarn, "Deposit")
        .withArgs(user1.address, depositAmount);
      
      // Check contract balance after deposit
      const contractBalanceAfter = await movinToken.balanceOf(await movinEarn.getAddress());
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(depositAmount);
    });

    it("Should fail when depositing zero amount", async function () {
      await expect(movinEarn.connect(user1).deposit(0))
        .to.be.revertedWithCustomError(movinEarn, "ZeroAmountNotAllowed");
    });

    it("Should fail when depositing more than balance", async function () {
      const excessAmount = ethers.parseEther("2000"); // More than user has
      
      await expect(movinEarn.connect(user1).deposit(excessAmount))
        .to.be.revertedWithCustomError(movinEarn, "InsufficientBalance");
    });
  });
}); 