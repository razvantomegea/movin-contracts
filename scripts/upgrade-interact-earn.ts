import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Constants for Hardhat local network deployment
const MOVIN_EARN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  // Get contract factories
  const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
  
  // Get signers for testing
  const [owner, user1, user2] = await ethers.getSigners();
  console.log("✅ Owner address:", owner.address);
  console.log("✅ User1 address:", user1.address);
  console.log("✅ User2 address:", user2.address);

  // Get current contract instance
  console.log("Connecting to MOVINEarn contract at", MOVIN_EARN_ADDRESS);
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_ADDRESS);
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_ADDRESS);

  // Verify current state
  console.log("\n--- 📊 VERIFYING CURRENT STATE ---");
  try {
    const user1StakesCount = await movinEarn.connect(user1).getUserStakeCount();
    console.log(`✅ User1 has ${user1StakesCount} stakes before upgrade`);
  } catch (error) {
    console.error("❌ Error checking user stakes:", error);
  }

  try {
    const user1IsPremium = await movinEarn.getIsPremiumUser(user1.address);
    console.log(`✅ User1 premium status before upgrade: ${user1IsPremium}`);
  } catch (error) {
    console.error("❌ Error checking premium status:", error);
  }

  // Perform upgrade
  console.log("\n--- 🚀 UPGRADING TO MOVIN EARN V2 ---");
  try {
    console.log("Deploying implementation of MOVINEarnV2...");
    const upgradedMOVINEarn = await upgrades.upgradeProxy(MOVIN_EARN_ADDRESS, MOVINEarnV2);
    await upgradedMOVINEarn.waitForDeployment();
    console.log("✅ MOVINEarn upgraded to V2");

    // Initialize V2 specific functionality
    console.log("Initializing V2 functionality...");
    try {
      const tx = await upgradedMOVINEarn.initializeV2();
      await tx.wait();
      console.log("✅ V2 functionality initialized");
    } catch (initError: any) {
      // If initialization fails because it's already initialized, continue
      if (initError.message.includes("InvalidInitialization")) {
        console.log("⚠️ V2 already initialized or initialization not needed");
      } else {
        // For other errors, rethrow
        throw initError;
      }
    }
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
    return;
  }

  // Get upgraded contract instance
  const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_ADDRESS);

  // Verify state preservation
  console.log("\n--- 📊 VERIFYING STATE PRESERVATION ---");
  try {
    const user1StakesCount = await movinEarnV2.connect(user1).getUserStakeCount();
    console.log(`✅ User1 has ${user1StakesCount} stakes after upgrade`);
  } catch (error) {
    console.error("❌ Error checking user stakes:", error);
  }

  try {
    const user1IsPremium = await movinEarnV2.getIsPremiumUser(user1.address);
    console.log(`✅ User1 premium status after upgrade: ${user1IsPremium}`);
  } catch (error) {
    console.error("❌ Error checking premium status:", error);
  }

  // Test referral functionality
  console.log("\n--- 🤝 TESTING REFERRAL FUNCTIONALITY ---");
  try {
    // Check if referral already exists
    const referralInfo = await movinEarnV2.getReferralInfo(user2.address);
    
    if (referralInfo[0] === user1.address) {
      console.log("✅ Referral relationship already exists (user1 is referrer of user2)");
    } else if (referralInfo[0] === ethers.ZeroAddress) {
      // Register user1 as referrer for user2
      await movinEarnV2.connect(user2).registerReferral(user1.address);
      console.log("✅ User2 registered User1 as referrer");
      
      // Verify referral registration
      const updatedReferralInfo = await movinEarnV2.getReferralInfo(user2.address);
      if (updatedReferralInfo[0] === user1.address) {
        console.log("✅ Referral relationship verified");
      } else {
        console.log("❌ Referral relationship NOT verified");
      }
    } else {
      console.log(`❌ User2 already has a different referrer: ${referralInfo[0]}`);
    }
  } catch (error) {
    console.error("❌ Error testing referral functionality:", error);
  }

  // Test premium status control
  console.log("\n--- 👑 TESTING PREMIUM STATUS CONTROL ---");
  try {
    await movinEarnV2.connect(owner).setPremiumStatus(user2.address, true);
    const user2IsPremium = await movinEarnV2.getIsPremiumUser(user2.address);
    console.log(`✅ User2 premium status set to: ${user2IsPremium}`);
  } catch (error) {
    console.error("❌ Error setting premium status:", error);
  }

  // Test activity referral bonus
  console.log("\n--- 👟 TESTING ACTIVITY REFERRAL BONUS ---");
  try {
    // Record activity for user2
    const stepsToRecord = 12000;
    const metsToRecord = 20;
    await movinEarnV2.connect(user2).recordActivity(stepsToRecord, metsToRecord);
    console.log(`✅ Recorded ${stepsToRecord} steps and ${metsToRecord} METs for User2`);

    // Check if user1 received the referral bonus
    const user1Activity = await movinEarnV2.userActivities(user1.address);
    const referralBonusSteps = (stepsToRecord * 1) / 100; // 1% bonus
    if (Number(user1Activity[0]) >= referralBonusSteps) {
      console.log(`✅ User1 received ${user1Activity[0]} steps as referral bonus`);
    } else {
      console.log(`❌ User1 did not receive expected referral bonus. Steps: ${user1Activity[0]}`);
    }
  } catch (error) {
    console.error("❌ Error testing activity referral bonus:", error);
  }

  // Test daily reward rate decrease
  console.log("\n--- 📉 TESTING DAILY REWARD RATE DECREASE ---");
  try {
    // Get initial rates
    const initialStepsRate = await movinEarnV2.baseStepsRate();
    const initialMetsRate = await movinEarnV2.baseMetsRate();
    
    console.log(`✅ Initial steps rate: ${ethers.formatEther(initialStepsRate)} MOVIN`);
    console.log(`✅ Initial METs rate: ${ethers.formatEther(initialMetsRate)} MOVIN`);
    
    // Advance time by 1 day
    await time.increase(24 * 60 * 60);
    console.log("⏱ Advanced time by 1 day");
    
    // Record activity to trigger rate decrease check
    await movinEarnV2.connect(user1).recordActivity(10000, 10);
    console.log("✅ Recorded activity to trigger rate check");
    
    // Check new rates
    const newStepsRate = await movinEarnV2.baseStepsRate();
    const newMetsRate = await movinEarnV2.baseMetsRate();
    
    console.log(`✅ New steps rate: ${ethers.formatEther(newStepsRate)} MOVIN`);
    console.log(`✅ New METs rate: ${ethers.formatEther(newMetsRate)} MOVIN`);
    
    // Verify decrease (expect 1% decrease from initial rate)
    const expectedNewRate = (initialStepsRate * 99n) / 100n;
    if (newStepsRate === expectedNewRate) {
      console.log(`✅ Rate decreased as expected by 1%`);
    } else {
      console.log(`❌ Rate decrease didn't match expectation. Expected: ${expectedNewRate}, Got: ${newStepsRate}`);
    }
  } catch (error) {
    console.error("❌ Error testing daily rate decrease:", error);
  }

  // Test the new claimAllStakingRewards functionality
  console.log("\n--- 🎯 TESTING CLAIM ALL STAKING REWARDS ---");
  try {
    // Mint tokens to user1 for testing
    console.log("Minting tokens to user1 for testing...");
    await movinToken.connect(owner).mint(user1.address, ethers.parseEther("10000"));
    console.log(`✅ Minted 10,000 MOVIN tokens to user1`);

    // Create multiple stakes for user1
    const stake1Amount = ethers.parseEther("1000");
    const stake2Amount = ethers.parseEther("1500");
    const stake3Amount = ethers.parseEther("2000");
    
    // Approve and verify approval
    await movinToken.connect(user1).approve(
      MOVIN_EARN_ADDRESS, 
      stake1Amount + stake2Amount + stake3Amount
    );
    const allowance = await movinToken.allowance(user1.address, MOVIN_EARN_ADDRESS);
    console.log(`✅ User1 approved ${ethers.formatEther(allowance)} tokens for staking`);
    
    // Check user balance
    const userBalance = await movinToken.balanceOf(user1.address);
    console.log(`✅ User1 balance before staking: ${ethers.formatEther(userBalance)} MOVIN`);

    // Create 3 different stakes
    await movinEarnV2.connect(user1).stakeTokens(stake1Amount, 1); // 1 month lock
    await movinEarnV2.connect(user1).stakeTokens(stake2Amount, 3); // 3 months lock
    await movinEarnV2.connect(user1).stakeTokens(stake3Amount, 6); // 6 months lock
    
    const stakeCount = await movinEarnV2.connect(user1).getUserStakeCount();
    console.log(`✅ User1 created ${stakeCount} stakes`);
    
    // Advance time to accumulate rewards (15 days)
    await time.increase(15 * 24 * 60 * 60);
    console.log("⏱ Advanced time by 15 days to accumulate rewards");
    
    // Calculate expected total rewards
    let totalExpectedReward = 0n;
    for (let i = 0; i < stakeCount; i++) {
      const stakeReward = await movinEarnV2.connect(user1).calculateStakingReward(i);
      console.log(`✅ Stake ${i} expected reward: ${ethers.formatEther(stakeReward)} MOVIN`);
      totalExpectedReward += stakeReward;
    }
    
    // Calculate burn amount and expected user rewards
    const burnPercent = 1n; // 1% burn fee
    const burnAmount = (totalExpectedReward * burnPercent) / 100n;
    const expectedUserReward = totalExpectedReward - burnAmount;
    
    console.log(`✅ Total expected reward: ${ethers.formatEther(totalExpectedReward)} MOVIN`);
    console.log(`✅ Expected burn amount: ${ethers.formatEther(burnAmount)} MOVIN`);
    console.log(`✅ Expected user reward: ${ethers.formatEther(expectedUserReward)} MOVIN`);
    
    // Get user balance before claiming
    const balanceBefore = await movinToken.balanceOf(user1.address);
    console.log(`✅ User1 balance before claiming: ${ethers.formatEther(balanceBefore)} MOVIN`);
    
    // Claim all rewards in one transaction
    const tx = await movinEarnV2.connect(user1).claimAllStakingRewards();
    await tx.wait();
    console.log("✅ Successfully claimed all staking rewards in one transaction");
    
    // Get user balance after claiming
    const balanceAfter = await movinToken.balanceOf(user1.address);
    console.log(`✅ User1 balance after claiming: ${ethers.formatEther(balanceAfter)} MOVIN`);
    
    const actualReward = balanceAfter - balanceBefore;
    console.log(`✅ Actual reward received: ${ethers.formatEther(actualReward)} MOVIN`);
    
    // Verify the reward is close to expected (allow for small rounding differences)
    const rewardDifference = expectedUserReward > actualReward 
      ? expectedUserReward - actualReward 
      : actualReward - expectedUserReward;
    
    const isCloseEnough = rewardDifference < ethers.parseEther("0.01");
    if (isCloseEnough) {
      console.log("✅ Reward amount matches expected value (within tolerance)");
    } else {
      console.log(`❌ Reward amount differs significantly from expected. Difference: ${ethers.formatEther(rewardDifference)} MOVIN`);
    }
    
    // Verify all stakes have updated lastClaimed timestamps
    let allTimestampsUpdated = true;
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock?.timestamp || 0;
    
    for (let i = 0; i < stakeCount; i++) {
      const stake = await movinEarnV2.connect(user1).getUserStake(i);
      const timeDiff = Number(stake.lastClaimed) - currentTimestamp;
      
      if (Math.abs(timeDiff) > 5) { // Allow 5 seconds difference
        allTimestampsUpdated = false;
        console.log(`❌ Stake ${i} lastClaimed timestamp not properly updated`);
      }
    }
    
    if (allTimestampsUpdated) {
      console.log("✅ All stakes' lastClaimed timestamps were properly updated");
    }
    
    // Now advance time again for stake claims to avoid test bugs
    await time.increase(60); // 1 minute
    await ethers.provider.send("evm_mine", []);
    console.log("⏱ Advanced time by 1 minute and mined a block to ensure timestamp updates");
    
    // Try claiming again (should fail since no new rewards accumulated)
    console.log("\nTesting second claim (should fail with NoRewardsAvailable):");
    try {
      // Calculate rewards before second claim to verify they're zero
      let hasRewards = false;
      let totalRewardsBeforeSecondClaim = 0n;
      for (let i = 0; i < stakeCount; i++) {
        const reward = await movinEarnV2.connect(user1).calculateStakingReward(i);
        console.log(`Stake ${i} reward before second claim: ${ethers.formatEther(reward)} MOVIN`);
        totalRewardsBeforeSecondClaim += reward;
        if (reward > 0) hasRewards = true;
      }
      
      if (hasRewards) {
        console.log(`⚠️ Rewards still available (${ethers.formatEther(totalRewardsBeforeSecondClaim)} MOVIN), expected 0`);
      } else {
        console.log("✅ No rewards available as expected");
      }
      
      console.log("Attempting second claim (should fail with NoRewardsAvailable)...");
      
      // Attempt to claim again
      try {
        const secondClaimTx = await movinEarnV2.connect(user1).claimAllStakingRewards();
        await secondClaimTx.wait();
        console.log("❌ Second claim succeeded but should have failed");
      } catch (claimError: any) {
        if (claimError.message.includes("NoRewardsAvailable")) {
          console.log("✅ Second claim failed as expected (NoRewardsAvailable)");
        } else {
          console.log(`❌ Second claim failed but with unexpected error type: ${claimError.message.split('\n')[0]}`);
        }
      }
    } catch (error) {
      console.error("❌ Error testing second claim:", error);
    }
    
  } catch (error) {
    console.error("❌ Error testing claimAllStakingRewards functionality:", error);
    console.error(error);
  }

  console.log("\n✅ Upgrade test complete: MOVINEarn successfully upgraded to V2 with new functionality!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
