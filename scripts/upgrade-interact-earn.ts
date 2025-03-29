import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Log } from "@ethersproject/abstract-provider";

// Constants for Hardhat local network deployment
const MOVIN_EARN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// Custom parameters for migration testing
const SETUP_TEST_DATA = true; // Set to true to create test data before migration
const NUM_TEST_STAKES = 3; // Number of test stakes to create per user
const NUM_TEST_ACTIVITIES = 5; // Number of activity records to create

async function main() {
  // Get contract factories
  const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
  
  // Get signers for testing
  const [owner, user1, user2, user3] = await ethers.getSigners();
  console.log("✅ Owner address:", owner.address);
  console.log("✅ User1 address:", user1.address);
  console.log("✅ User2 address:", user2.address);
  console.log("✅ User3 address:", user3.address);

  // Get current contract instance
  console.log("Connecting to MOVINEarn contract at", MOVIN_EARN_ADDRESS);
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_ADDRESS);
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_ADDRESS);

  // Setup test data if needed (create activities and stakes)
  if (SETUP_TEST_DATA) {
    console.log("\n--- 🛠️ SETTING UP TEST DATA ---");
    await setupTestData(movinEarn, movinToken, [user1, user2, user3], owner);
  }

  // Verify current state
  console.log("\n--- 📊 VERIFYING CURRENT STATE ---");
  const testUsers = [user1, user2, user3];
  for (const user of testUsers) {
    await verifyUserState(movinEarn, user, "before upgrade");
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
  for (const user of testUsers) {
    await verifyUserState(movinEarnV2, user, "after upgrade");
  }

  // Test data migration
  console.log("\n--- 🔄 TESTING DATA MIGRATION FUNCTIONALITY ---");
  await testDataMigration(movinEarnV2, [user1, user2, user3], owner);

  // Test V2 specific functionality - Referrals
  console.log("\n--- 🤝 TESTING REFERRAL FUNCTIONALITY ---");
  await testReferrals(movinEarnV2, user1, user2, movinToken, owner);

  // Test V2 specific functionality - Activities and Rewards
  console.log("\n--- 👟 TESTING ACTIVITY AND REWARDS FUNCTIONALITY ---");
  await testActivitiesAndRewards(movinEarnV2, movinToken, user1, user2, user3, owner);

  // Test claim all staking rewards
  console.log("\n--- 🎯 TESTING CLAIM ALL STAKING REWARDS ---");
  await testClaimAllStakingRewards(movinEarnV2, movinToken, user3, owner);

  console.log("\n✅ Upgrade test complete: MOVINEarn successfully upgraded to V2 with new functionality!");
}

async function setupTestData(
  movinEarn: any, 
  movinToken: any, 
  users: any[], 
  owner: any
) {
  try {
    console.log("Minting MOVIN tokens to users...");
    for (const user of users) {
      const mintAmount = ethers.parseEther("10000");
      await movinToken.connect(owner).mint(user.address, mintAmount);
      console.log(`✅ Minted ${ethers.formatEther(mintAmount)} MOVIN to ${user.address}`);
      
      // Approve tokens for staking
      await movinToken.connect(user).approve(movinEarn.getAddress(), mintAmount);
      console.log(`✅ User ${user.address} approved ${ethers.formatEther(mintAmount)} tokens for staking`);
    }
    
    // Create different stakes
    console.log("\nCreating test stakes...");
    const stakeDurations = [1, 3, 6]; // 1, 3, and 6 month durations
    
    for (const user of users) {
      const userStakeCount = await movinEarn.connect(user).getUserStakeCount();
      console.log(`User ${user.address} already has ${userStakeCount} stakes`);
      
      // Only create stakes if user doesn't have any
      if (userStakeCount < NUM_TEST_STAKES) {
        for (let i = 0; i < NUM_TEST_STAKES; i++) {
          const amount = ethers.parseEther(String(500 + i * 500)); // 500, 1000, 1500 tokens
          const duration = stakeDurations[i % stakeDurations.length];
          
          await movinEarn.connect(user).stakeTokens(amount, duration);
          console.log(`✅ User ${user.address} staked ${ethers.formatEther(amount)} tokens for ${duration} month(s)`);
        }
      } else {
        console.log(`⏩ Skipping stake creation for user ${user.address} - already has ${userStakeCount} stakes`);
      }
    }
    
    // Record activities
    console.log("\nRecording test activities...");
    
    for (let i = 0; i < NUM_TEST_ACTIVITIES; i++) {
      const stepsBase = 10000;
      const metsBase = 15;
      
      for (const [index, user] of users.entries()) {
        // Add some variation in activity data
        const steps = stepsBase + (index * 1000) + (i * 500);
        const mets = metsBase + index + i;
        
        await movinEarn.connect(user).recordActivity(steps, mets);
        console.log(`✅ User ${user.address} recorded activity: ${steps} steps, ${mets} METs`);
        
        // Small delay to ensure different timestamps
        await time.increase(60); // Increase by 1 minute
      }
    }
    
    // Set premium status for one user
    await movinEarn.connect(owner).setPremiumStatus(users[0].address, true);
    console.log(`✅ Set premium status for user ${users[0].address}`);
    
    // Advance time to accumulate rewards
    await time.increase(7 * 24 * 60 * 60); // 7 days
    console.log("⏱ Advanced time by 7 days to accumulate rewards");
    
    console.log("✅ Test data setup complete");
  } catch (error) {
    console.error("❌ Error setting up test data:", error);
  }
}

async function verifyUserState(contract: any, user: any, stage: string) {
  console.log(`\nVerifying state for user ${user.address} ${stage}:`);
  
  try {
    // Check stakes
    const stakeCount = await contract.connect(user).getUserStakeCount();
    console.log(`✅ User has ${stakeCount} stakes`);
    
    if (stakeCount > 0) {
      // Get first stake details
      const firstStake = await contract.connect(user).getUserStake(0);
      console.log(`  - First stake amount: ${ethers.formatEther(firstStake.amount)} MOVIN`);
      console.log(`  - Lock duration: ${firstStake.lockDuration} months`);
      console.log(`  - Last claimed timestamp: ${new Date(Number(firstStake.lastClaimed) * 1000).toISOString()}`);
    }
    
    // Check premium status
    const isPremium = await contract.getIsPremiumUser(user.address);
    console.log(`✅ Premium status: ${isPremium}`);
    
    // Check activity data
    try {
      const [steps, mets] = await contract.connect(user).getUserActivity();
      console.log(`✅ Daily activity: ${steps} steps, ${mets} METs`);
      
      // Get pending rewards if function exists (V2 only)
      if (contract.interface.hasFunction("getPendingActivityRewards")) {
        const [pendingStepsReward, pendingMetsReward] = await contract.connect(user).getPendingActivityRewards();
        console.log(`✅ Pending activity rewards: ${ethers.formatEther(pendingStepsReward)} steps, ${ethers.formatEther(pendingMetsReward)} METs`);
      }
    } catch (error) {
      console.log(`❌ Error reading activity data: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Check referral info if function exists (V2 only)
    if (contract.interface.hasFunction("getReferralInfo")) {
      try {
        const [referrer, referralCount] = await contract.getReferralInfo(user.address);
        console.log(`✅ Referrer: ${referrer === ethers.ZeroAddress ? 'None' : referrer}`);
        console.log(`✅ Referred users count: ${referralCount}`);
      } catch (error) {
        console.log(`❌ Error reading referral info: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error verifying user state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testDataMigration(movinEarnV2: any, users: any[], owner: any) {
  try {
    console.log("\nPreparing for data migration test...");
    
    // Record current state of users
    const userData: any[] = [];
    for (const user of users) {
      try {
        const stakeCount = await movinEarnV2.connect(user).getUserStakeCount();
        const isPremium = await movinEarnV2.getIsPremiumUser(user.address);
        let activity;
        try {
          activity = await movinEarnV2.userActivities(user.address);
        } catch (e) {
          activity = { pendingStepsRewards: 0, pendingMetsRewards: 0 };
        }
        
        userData.push({
          address: user.address,
          stakeCount,
          isPremium,
          pendingStepsRewards: activity.pendingStepsRewards,
          pendingMetsRewards: activity.pendingMetsRewards
        });
        
        console.log(`✅ Recorded pre-migration state for ${user.address}`);
        console.log(`  - Stakes: ${stakeCount}`);
        console.log(`  - Premium: ${isPremium}`);
        console.log(`  - Pending rewards: ${ethers.formatEther(activity.pendingStepsRewards)} steps, ${ethers.formatEther(activity.pendingMetsRewards)} METs`);
      } catch (error) {
        console.log(`❌ Error recording state for ${user.address}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Test individual user migration
    console.log("\nTesting individual user migration...");
    const testUser = users[0];
    try {
      const migrateTx = await movinEarnV2.connect(owner).migrateUserData(testUser.address);
      await migrateTx.wait();
      console.log(`✅ Successfully migrated user ${testUser.address}`);
      
      // Verify migration didn't change critical data
      const stakeCountAfter = await movinEarnV2.connect(testUser).getUserStakeCount();
      const isPremiumAfter = await movinEarnV2.getIsPremiumUser(testUser.address);
      let activityAfter;
      try {
        activityAfter = await movinEarnV2.userActivities(testUser.address);
      } catch (e) {
        activityAfter = { pendingStepsRewards: 0, pendingMetsRewards: 0 };
      }
      
      const userDataBefore = userData.find(u => u.address === testUser.address);
      if (userDataBefore) {
        console.log(`\nVerifying migration results for ${testUser.address}:`);
        console.log(`  Stakes before: ${userDataBefore.stakeCount}, after: ${stakeCountAfter}`);
        console.log(`  Premium before: ${userDataBefore.isPremium}, after: ${isPremiumAfter}`);
        console.log(`  Pending step rewards before: ${ethers.formatEther(userDataBefore.pendingStepsRewards)}, after: ${ethers.formatEther(activityAfter.pendingStepsRewards)}`);
        console.log(`  Pending MET rewards before: ${ethers.formatEther(userDataBefore.pendingMetsRewards)}, after: ${ethers.formatEther(activityAfter.pendingMetsRewards)}`);
        
        if (
          userDataBefore.stakeCount === stakeCountAfter &&
          userDataBefore.isPremium === isPremiumAfter
        ) {
          console.log("✅ Migration preserved critical user data successfully");
        } else {
          console.log("❌ Migration changed critical user data");
        }
      }
    } catch (error) {
      console.log(`❌ Error migrating individual user: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Test bulk migration
    console.log("\nTesting bulk migration...");
    const userAddresses = users.slice(1).map(u => u.address); // Skip first user which was already migrated
    
    try {
      const bulkMigrateTx = await movinEarnV2.connect(owner).bulkMigrateUserData(userAddresses);
      const receipt = await bulkMigrateTx.wait();
      
      // Check for migration events
      const migrationEvents = receipt?.logs.filter(
        (log: Log) => log.topics[0] === movinEarnV2.interface.getEvent("BulkMigrationCompleted").topicHash
      );
      
      if (migrationEvents && migrationEvents.length > 0) {
        const event = movinEarnV2.interface.parseLog({
          topics: migrationEvents[0].topics as string[],
          data: migrationEvents[0].data
        });
        
        if (event?.args) {
          const successCount = Number(event.args.successCount);
          const totalUsers = Number(event.args.totalUsers);
          
          console.log(`✅ Bulk migration results: ${successCount}/${totalUsers} users successfully migrated`);
        }
      } else {
        console.log("⚠️ No migration events found, unable to verify bulk migration results");
      }
      
      // Verify all users are accessible after migration
      for (const user of users.slice(1)) {
        try {
          const stakeCountAfter = await movinEarnV2.connect(user).getUserStakeCount();
          console.log(`✅ User ${user.address} is accessible after migration with ${stakeCountAfter} stakes`);
        } catch (error) {
          console.log(`❌ Error accessing user ${user.address} after migration: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error performing bulk migration: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log("\n✅ Data migration testing completed");
  } catch (error) {
    console.error("❌ Error in data migration test:", error);
  }
}

async function testReferrals(movinEarnV2: any, referrer: any, referee: any, movinToken: any, owner: any) {
  try {
    // Check if referral already exists
    const referralInfo = await movinEarnV2.getReferralInfo(referee.address);
    
    if (referralInfo[0] === referrer.address) {
      console.log("✅ Referral relationship already exists (referrer is already set)");
    } else if (referralInfo[0] === ethers.ZeroAddress) {
      // Register referrer for referee
      await movinEarnV2.connect(referee).registerReferral(referrer.address);
      console.log(`✅ Referee registered Referrer as their referrer`);
      
      // Verify referral registration
      const updatedReferralInfo = await movinEarnV2.getReferralInfo(referee.address);
      if (updatedReferralInfo[0] === referrer.address) {
        console.log("✅ Referral relationship verified");
      } else {
        console.log("❌ Referral relationship NOT verified");
      }
    } else {
      console.log(`❌ Referee already has a different referrer: ${referralInfo[0]}`);
    }
    
    // Get referrer's referral count
    const [_, earnedBonus, referralCount] = await movinEarnV2.getReferralInfo(referrer.address);
    console.log(`✅ Referrer has ${referralCount} referred users and has earned ${ethers.formatEther(earnedBonus)} MOVIN in referral bonuses`);
    
    // Set referee as premium to get rewards
    try {
      await movinEarnV2.connect(owner).setPremiumStatus(referee.address, true);
      console.log("✅ Set referee as premium user");
    } catch (error) {
      console.error(`❌ Failed to set premium status: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log("\nTesting referral rewards bonus...");
    
    // Record activity for referee that will generate rewards
    const stepsToRecord = 10000; // STEPS_THRESHOLD
    const metsToRecord = 10;    // METS_THRESHOLD
    await movinEarnV2.connect(referee).recordActivity(stepsToRecord, metsToRecord);
    console.log(`✅ Recorded ${stepsToRecord} steps and ${metsToRecord} METs for referee (should generate rewards)`);
    
    // Check if rewards were generated
    const [pendingStepsReward, pendingMetsReward] = await movinEarnV2.connect(referee).getPendingRewards();
    const totalPendingRewards = pendingStepsReward + pendingMetsReward;
    
    if (totalPendingRewards > 0) {
      console.log(`✅ Referee has ${ethers.formatEther(totalPendingRewards)} MOVIN in pending rewards`);
      
      // Get balances before claiming
      const referrerBalanceBefore = await movinToken.balanceOf(referrer.address);
      const refereeBalanceBefore = await movinToken.balanceOf(referee.address);
      
      console.log(`Referrer balance before: ${ethers.formatEther(referrerBalanceBefore)} MOVIN`);
      console.log(`Referee balance before: ${ethers.formatEther(refereeBalanceBefore)} MOVIN`);
      
      // Calculate expected amounts
      const burnAmount = (totalPendingRewards * BigInt(1)) / BigInt(100); // 1% burn fee
      const afterBurnReward = totalPendingRewards - burnAmount;
      const referralBonus = (afterBurnReward * BigInt(1)) / BigInt(100); // 1% referral bonus
      const expectedRefereeReward = afterBurnReward - referralBonus;
      
      // Claim rewards
      console.log("Claiming rewards...");
      try {
        await movinEarnV2.connect(referee).claimRewards();
        console.log("✅ Rewards claimed successfully");
        
        // Get balances after claiming
        const referrerBalanceAfter = await movinToken.balanceOf(referrer.address);
        const refereeBalanceAfter = await movinToken.balanceOf(referee.address);
        
        console.log(`Referrer balance after: ${ethers.formatEther(referrerBalanceAfter)} MOVIN`);
        console.log(`Referee balance after: ${ethers.formatEther(refereeBalanceAfter)} MOVIN`);
        
        // Calculate actual received amounts
        const referrerReceived = referrerBalanceAfter - referrerBalanceBefore;
        const refereeReceived = refereeBalanceAfter - refereeBalanceBefore;
        
        console.log(`Referrer received: ${ethers.formatEther(referrerReceived)} MOVIN`);
        console.log(`Referee received: ${ethers.formatEther(refereeReceived)} MOVIN`);
        
        // Verify amounts
        if (referrerReceived > 0) {
          console.log(`✅ Referrer received ${ethers.formatEther(referrerReceived)} MOVIN as referral bonus`);
          
          // Check if it's close to the expected 1%
          const referrerReceivedNum = Number(referrerReceived);
          const afterBurnRewardNum = Number(afterBurnReward);
          const actualPercentage = (referrerReceivedNum * 100) / afterBurnRewardNum;
          console.log(`Actual referral bonus percentage: ~${actualPercentage.toFixed(2)}% (should be close to 1%)`);
          
          if (Math.abs(actualPercentage - 1.0) < 0.1) {
            console.log("✅ Referral bonus percentage is correct");
          } else {
            console.log("❌ Referral bonus percentage is incorrect");
          }
        } else {
          console.log("❌ Referrer did not receive any bonus");
        }
        
        // Check if referee got the expected amount (minus referral bonus)
        if (Math.abs(Number(refereeReceived) - Number(expectedRefereeReward)) < Number(1e14)) { // Small rounding tolerance
          console.log("✅ Referee received the correct amount (after burn fee and referral bonus)");
        } else {
          console.log(`❌ Referee received an unexpected amount. Expected: ${ethers.formatEther(expectedRefereeReward)}, Actual: ${ethers.formatEther(refereeReceived)}`);
        }
        
        // Check if earnedBonus was updated in the contract
        const [_, updatedEarnedBonus, __] = await movinEarnV2.getReferralInfo(referrer.address);
        if (updatedEarnedBonus > earnedBonus) {
          console.log(`✅ Referrer's earnedBonus was updated in the contract: ${ethers.formatEther(updatedEarnedBonus)}`);
        } else {
          console.log("❌ Referrer's earnedBonus was not updated in the contract");
        }
        
      } catch (error) {
        console.log(`❌ Error claiming rewards: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log("❌ No pending rewards generated. Cannot test referral bonus.");
    }
    
    console.log("\n✅ Referral functionality testing completed");
  } catch (error) {
    console.error("❌ Error testing referral functionality:", error);
  }
}

async function testActivitiesAndRewards(
  movinEarnV2: any, 
  movinToken: any, 
  user1: any, 
  user2: any,
  user3: any,
  owner: any
) {
  try {
    console.log("\nRecording activities and testing rewards...");
    
    // First test hourly limits
    console.log("\nTesting hourly activity limits...");
    
    // Get hourly limits from the contract
    const MAX_HOURLY_STEPS = await movinEarnV2.MAX_HOURLY_STEPS();
    const MAX_HOURLY_METS = await movinEarnV2.MAX_HOURLY_METS();
    console.log(`Maximum hourly limits: ${MAX_HOURLY_STEPS} steps, ${MAX_HOURLY_METS} METs`);

    // Reset time to ensure we're starting with a clean state
    await time.increase(3600 + 60); // Advance more than 1 hour to reset hourly counters
    
    // Record activity within hourly limits - use 50% of the limit
    const steps1 = Number(MAX_HOURLY_STEPS) / 2;
    const mets1 = Number(MAX_HOURLY_METS) / 2;
    await movinEarnV2.connect(user1).recordActivity(steps1, mets1);
    console.log(`✅ User recorded ${steps1} steps and ${mets1} METs (50% of hourly limits)`);
    
    // Record more activity but still within limits - use 40% more (90% total)
    const steps2 = Number(MAX_HOURLY_STEPS) * 0.4;
    const mets2 = Number(MAX_HOURLY_METS) * 0.4;
    await movinEarnV2.connect(user1).recordActivity(steps2, mets2);
    console.log(`✅ User recorded additional ${steps2} steps and ${mets2} METs (now at 90% of hourly limits)`);
    
    // Try to exceed hourly limits by adding 15% more (would be 105% total)
    try {
      const exceededSteps = Number(MAX_HOURLY_STEPS) * 0.15;
      const exceededMets = Number(MAX_HOURLY_METS) * 0.15;
      await movinEarnV2.connect(user1).recordActivity(exceededSteps, exceededMets);
      console.log("❌ User was able to exceed hourly limits - this should not happen!");
    } catch (error) {
      console.log("✅ User was correctly prevented from exceeding hourly limits");
    }
    
    // Advance time to next hour
    await time.increase(3600 + 60); // 1 hour + 1 minute
    console.log("⏱ Advanced time by 1 hour");
    
    // Now we should be able to record activity again - use 80% of the limit
    const steps3 = Number(MAX_HOURLY_STEPS) * 0.8;
    const mets3 = Number(MAX_HOURLY_METS) * 0.8;
    await movinEarnV2.connect(user1).recordActivity(steps3, mets3);
    console.log(`✅ After 1 hour, user was able to record ${steps3} steps and ${mets3} METs (80% of hourly limits)`);
    
    // Test daily limits
    console.log("\nTesting daily activity limits...");
    
    // Create a new user to test daily limits from scratch
    const testUser = user3;
    
    // Set test user as premium
    await movinEarnV2.connect(owner).setPremiumStatus(testUser.address, true);
    console.log("✅ Set test user as premium");
    
    // Check MAX_DAILY limits
    const MAX_DAILY_STEPS = await movinEarnV2.MAX_DAILY_STEPS();
    const MAX_DAILY_METS = await movinEarnV2.MAX_DAILY_METS();
    console.log(`Maximum daily limits: ${MAX_DAILY_STEPS} steps, ${MAX_DAILY_METS} METs`);
    
    // Reset time to ensure we're starting with a clean state for the new user
    await time.increase(24 * 60 * 60 + 60); // Advance more than a day to reset daily counters
    
    // Try to record activity exceeding the maximum daily limits directly
    try {
      await movinEarnV2.connect(testUser).recordActivity(Number(MAX_DAILY_STEPS) + 1, 5);
      console.log("❌ User was able to exceed max daily steps limit directly - this should not happen!");
    } catch (error) {
      console.log("✅ User was correctly prevented from exceeding max daily steps limit directly");
    }
    
    try {
      await movinEarnV2.connect(testUser).recordActivity(5000, Number(MAX_DAILY_METS) + 1);
      console.log("❌ User was able to exceed max daily METs limit directly - this should not happen!");
    } catch (error) {
      console.log("✅ User was correctly prevented from exceeding max daily METs limit directly");
    }
    
    // Test approaching the daily limits through multiple recordings
    console.log("\nTesting daily limits through accumulation:");
    
    // Record activity in multiple calls - in hourly chunks
    // First hour - use 30% of daily limit but ensure we don't exceed hourly limit
    const dailyBatch1Steps = Math.min(Number(MAX_DAILY_STEPS) * 0.3, Number(MAX_HOURLY_STEPS));
    const dailyBatch1Mets = Math.min(Number(MAX_DAILY_METS) * 0.3, Number(MAX_HOURLY_METS));
    await movinEarnV2.connect(testUser).recordActivity(dailyBatch1Steps, dailyBatch1Mets);
    console.log(`✅ User recorded ${dailyBatch1Steps} steps and ${dailyBatch1Mets} METs (first hour - 30% of daily limit)`);
    
    // Get recorded activity
    let [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
    console.log(`Current activity counts: ${recordedSteps} steps and ${recordedMets} METs`);
    
    // Advance time by an hour to reset hourly limits
    await time.increase(3600 + 60);
    console.log("⏱ Advanced time by 1 hour");
    
    // Second hour - use another 30% of daily limit but ensure we don't exceed hourly limit
    const dailyBatch2Steps = Math.min(Number(MAX_DAILY_STEPS) * 0.3, Number(MAX_HOURLY_STEPS));
    const dailyBatch2Mets = Math.min(Number(MAX_DAILY_METS) * 0.3, Number(MAX_HOURLY_METS)); 
    await movinEarnV2.connect(testUser).recordActivity(dailyBatch2Steps, dailyBatch2Mets);
    console.log(`✅ User recorded ${dailyBatch2Steps} steps and ${dailyBatch2Mets} METs (second hour - 30% more of daily limit)`);
    
    // Get accumulated activity
    [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
    console.log(`Current activity counts: ${recordedSteps} steps and ${recordedMets} METs`);
    
    // Advance time by another hour
    await time.increase(3600 + 60);
    console.log("⏱ Advanced time by 1 hour");
    
    // Third hour - use another 30% of daily limit but ensure we don't exceed hourly limit
    const dailyBatch3Steps = Math.min(Number(MAX_DAILY_STEPS) * 0.3, Number(MAX_HOURLY_STEPS));
    const dailyBatch3Mets = Math.min(Number(MAX_DAILY_METS) * 0.3, Number(MAX_HOURLY_METS));
    
    try {
      await movinEarnV2.connect(testUser).recordActivity(dailyBatch3Steps, dailyBatch3Mets);
      console.log(`✅ User recorded ${dailyBatch3Steps} steps and ${dailyBatch3Mets} METs (third hour - 30% more of daily limit)`);
      
      // Get updated activity counts
      [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
      console.log(`Current activity counts after third recording: ${recordedSteps} steps and ${recordedMets} METs`);
      
      // Since we're now at 90% of daily limit, try to add 15% more (which would exceed daily limit)
      await time.increase(3600 + 60); // Advance another hour
      try {
        const exceededDailySteps = Number(MAX_DAILY_STEPS) * 0.15;
        const exceededDailyMets = Number(MAX_DAILY_METS) * 0.15;
        await movinEarnV2.connect(testUser).recordActivity(exceededDailySteps, exceededDailyMets);
        
        // If we get here, check if we've actually exceeded limit or if the contract enforces it
        [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
        if (recordedSteps > Number(MAX_DAILY_STEPS) || recordedMets > Number(MAX_DAILY_METS)) {
          console.log(`❌ User was able to exceed daily limits - now at ${recordedSteps} steps and ${recordedMets} METs`);
        } else {
          console.log(`✅ Contract stopped accepting more than MAX_DAILY limit`);
        }
      } catch (error) {
        console.log("✅ User was correctly prevented from exceeding daily limits");
      }
    } catch (error) {
      console.log(`⚠️ Failed to record third batch activity: ${error instanceof Error ? error.message : String(error)}`);
      console.log("This may happen if the accumulated steps are already approaching the daily limit");
    }
    
    // Check if we're approaching maximum daily limits
    [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
    if (recordedSteps >= Number(MAX_DAILY_STEPS) * 0.9) {
      console.log(`⚠️ Steps count (${recordedSteps}) has reached or exceeded 90% of the maximum daily limit (${MAX_DAILY_STEPS})`);
    } else {
      console.log(`Steps count (${recordedSteps}) is still below 90% of the maximum daily limit (${MAX_DAILY_STEPS})`);
    }
    
    // Advance time to next day to test daily reset
    await time.increase(24 * 60 * 60 + 60);
    console.log("⏱ Advanced time by 1 day");
    
    // Record activity in the new day to verify daily reset
    await movinEarnV2.connect(testUser).recordActivity(5000, 5);
    console.log("✅ User recorded 5000 steps and 5 METs in the new day");
    
    // Get activity counts for the new day - these should only include the 5000 steps and 5 METs
    [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
    console.log(`Activity counts in new day: ${recordedSteps} steps and ${recordedMets} METs`);
    
    // Verify daily reset worked correctly - should be exactly the new values
    if (recordedSteps === 5000n && recordedMets === 5n) {
      console.log("✅ Daily activity counters reset correctly for the new day");
    } else {
      console.log(`❌ Daily activity counters did NOT reset correctly for the new day. Expected 5000 steps and 5 METs, got ${recordedSteps} steps and ${recordedMets} METs`);
      
      // Try recording more activity to see if the limits work correctly
      try {
        // Advance another hour
        await time.increase(3600 + 60);
        await movinEarnV2.connect(testUser).recordActivity(1000, 1);
        console.log("✅ Successfully recorded additional activity in the same day");
        
        // Get updated values
        [recordedSteps, recordedMets] = await movinEarnV2.connect(testUser).getUserActivity();
        console.log(`Updated activity counts: ${recordedSteps} steps and ${recordedMets} METs`);
      } catch (error) {
        console.log(`❌ Error recording additional activity: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Record activities for different users - using safe values below hourly limits
    console.log("\nTesting activity rewards...");
    
    // Advance time to ensure fresh state
    await time.increase(24 * 60 * 60 + 60);
    
    const activities = [
      { user: user1, steps: 2000, mets: 2 },
      { user: user2, steps: 4000, mets: 4 },
      { user: user3, steps: 6000, mets: 6 }
    ];
    
    for (const activity of activities) {
      // Set premium status to ensure METs are recorded
      await movinEarnV2.connect(owner).setPremiumStatus(activity.user.address, true);
      console.log(`✅ Set premium status for user ${activity.user.address}`);
      
      // Check token balance before
      const balanceBefore = await movinToken.balanceOf(activity.user.address);
      
      // Record activity - make sure it's above thresholds to generate rewards
      await movinEarnV2.connect(activity.user).recordActivity(activity.steps, activity.mets);
      console.log(`✅ User ${activity.user.address} recorded ${activity.steps} steps and ${activity.mets} METs`);
      
      // Get current activity counts
      const [recordedSteps, recordedMets] = await movinEarnV2.connect(activity.user).getUserActivity();
      console.log(`✅ Current activity counts: ${recordedSteps} steps and ${recordedMets} METs`);
      
      // Get the steps threshold from the contract
      const STEPS_THRESHOLD = await movinEarnV2.STEPS_THRESHOLD();
      
      // Ensure activity is above thresholds to generate rewards
      if (recordedSteps < Number(STEPS_THRESHOLD)) {
        // Add more steps to reach threshold
        const additionalSteps = Number(STEPS_THRESHOLD) - Number(recordedSteps) + 100; // Add a buffer
        await time.increase(3600 + 60); // Wait an hour to reset hourly limits
        await movinEarnV2.connect(activity.user).recordActivity(additionalSteps, 0);
        console.log(`✅ Added ${additionalSteps} more steps to reach threshold`);
      }
      
      // Get pending rewards
      const [pendingStepsReward, pendingMetsReward] = await movinEarnV2.connect(activity.user).getPendingRewards();
      console.log(`✅ Pending rewards: ${ethers.formatEther(pendingStepsReward)} for steps, ${ethers.formatEther(pendingMetsReward)} for METs`);
      
      // Claim rewards if available
      if (pendingStepsReward > 0 || pendingMetsReward > 0) {
        try {
          await movinEarnV2.connect(activity.user).claimRewards();
          console.log(`✅ Claimed activity rewards`);
          
          // Check if activity counts were reset
          const [stepsAfter, metsAfter] = await movinEarnV2.connect(activity.user).getUserActivity();
          if (stepsAfter === 0n && metsAfter === 0n) {
            console.log(`✅ Activity counts were reset to 0 after claiming, as expected`);
          } else {
            console.log(`❌ Activity counts were NOT reset after claiming: ${stepsAfter} steps, ${metsAfter} METs`);
          }
          
          // Check balance after claiming
          const balanceAfter = await movinToken.balanceOf(activity.user.address);
          const rewardAmount = balanceAfter - balanceBefore;
          
          console.log(`✅ Received ${ethers.formatEther(rewardAmount)} MOVIN tokens as reward`);
        } catch (error) {
          console.log(`❌ Error claiming rewards: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.log(`⚠️ No rewards available to claim`);
      }
      
      // Small delay between activities
      await time.increase(60); // 1 minute
    }
    
    // Test daily reward rate decrease
    console.log("\nTesting daily reward rate decrease...");
    
    // Get initial rates
    const initialStepsRate = await movinEarnV2.baseStepsRate();
    const initialMetsRate = await movinEarnV2.baseMetsRate();
    
    // Get halving rate constants
    const halvingRateNumerator = BigInt(999);
    const halvingRateDenominator = BigInt(1000);
    
    console.log(`Initial rates: ${ethers.formatEther(initialStepsRate)} for steps, ${ethers.formatEther(initialMetsRate)} for METs`);
    console.log(`Daily decrease rate: ${Number(halvingRateNumerator) / Number(halvingRateDenominator)} (${100 - (Number(halvingRateNumerator) * 100 / Number(halvingRateDenominator))}% decrease)`);
    
    // Advance time by 1 day
    await time.increase(24 * 60 * 60 + 60); // 1 day + 1 minute
    console.log("⏱ Advanced time by 1 day");
    
    // Record activity to trigger rate decrease check - use safe values
    await movinEarnV2.connect(user1).recordActivity(5000, 5);
    console.log("✅ Recorded activity to trigger rate check");
    
    // Check new rates
    const newStepsRate = await movinEarnV2.baseStepsRate();
    const newMetsRate = await movinEarnV2.baseMetsRate();
    
    console.log(`New rates: ${ethers.formatEther(newStepsRate)} for steps, ${ethers.formatEther(newMetsRate)} for METs`);
    
    if (newStepsRate < initialStepsRate) {
      const decreasePercent = 100 - (Number(newStepsRate) * 100 / Number(initialStepsRate));
      console.log(`✅ Rate decreased by approximately ${decreasePercent.toFixed(2)}%`);
      
      // Verify 0.1% decrease
      const expectedStepsRate = (initialStepsRate * halvingRateNumerator) / halvingRateDenominator;
      const expectedMetsRate = (initialMetsRate * halvingRateNumerator) / halvingRateDenominator;
      
      if (newStepsRate === expectedStepsRate && newMetsRate === expectedMetsRate) {
        console.log("✅ Rate decrease exactly matches the expected 0.1% reduction");
      } else if (Math.abs(Number(newStepsRate) - Number(expectedStepsRate)) < Number(1e10)) {
        console.log("✅ Rate decrease matches the expected 0.1% reduction (with small rounding difference)");
      } else {
        console.log("❌ Rate decrease doesn't match the expected 0.1% reduction");
        console.log(`Expected steps rate: ${ethers.formatEther(expectedStepsRate)}, Actual: ${ethers.formatEther(newStepsRate)}`);
        console.log(`Expected METs rate: ${ethers.formatEther(expectedMetsRate)}, Actual: ${ethers.formatEther(newMetsRate)}`);
      }
    } else {
      console.log(`❌ Rate did not decrease as expected`);
    }
    
    console.log("\n✅ Activities and rewards testing completed");
  } catch (error) {
    console.error("❌ Error testing activities and rewards:", error);
  }
}

async function testClaimAllStakingRewards(
  movinEarnV2: any, 
  movinToken: any, 
  user: any,
  owner: any
) {
  try {
    // Ensure user has multiple stakes
    const stakeCount = await movinEarnV2.connect(user).getUserStakeCount();
    console.log(`User has ${stakeCount} stakes`);
    
    if (stakeCount < 3) {
      // Create more stakes
      console.log("Creating additional stakes for testing...");
      
      // Mint tokens if needed
      const userBalance = await movinToken.balanceOf(user.address);
      if (userBalance < ethers.parseEther("5000")) {
        await movinToken.connect(owner).mint(user.address, ethers.parseEther("10000"));
        console.log(`✅ Minted additional tokens to user`);
        
        // Approve tokens for staking
        await movinToken.connect(user).approve(movinEarnV2.getAddress(), ethers.parseEther("10000"));
      }
      
      // Create stakes
      const stakeDurations = [1, 3, 6]; // 1, 3, and 6 month durations
      for (let i = 0; i < 3 - stakeCount; i++) {
        const amount = ethers.parseEther(String(1000 + i * 500)); // 1000, 1500, 2000 tokens
        const duration = stakeDurations[i];
        
        await movinEarnV2.connect(user).stakeTokens(amount, duration);
        console.log(`✅ Created stake of ${ethers.formatEther(amount)} tokens for ${duration} month(s)`);
      }
    }
    
    // Advance time to accumulate rewards
    await time.increase(15 * 24 * 60 * 60); // 15 days
    console.log("⏱ Advanced time by 15 days to accumulate rewards");
    
    // Calculate expected rewards for each stake
    const updatedStakeCount = await movinEarnV2.connect(user).getUserStakeCount();
    let totalExpectedReward = 0n;
    
    console.log("\nCalculating expected rewards for each stake:");
    for (let i = 0; i < updatedStakeCount; i++) {
      const stake = await movinEarnV2.connect(user).getUserStake(i);
      const stakeReward = await movinEarnV2.connect(user).calculateStakingReward(i);
      
      console.log(`Stake ${i} (${ethers.formatEther(stake.amount)} MOVIN for ${stake.lockDuration} months):`);
      console.log(`  Expected reward: ${ethers.formatEther(stakeReward)} MOVIN`);
      
      totalExpectedReward += stakeReward;
    }
    
    console.log(`\nTotal expected reward: ${ethers.formatEther(totalExpectedReward)} MOVIN`);
    
    // Check user balance before claiming
    const balanceBefore = await movinToken.balanceOf(user.address);
    console.log(`User balance before claiming: ${ethers.formatEther(balanceBefore)} MOVIN`);
    
    // Claim all rewards
    console.log("\nClaiming all staking rewards...");
    const tx = await movinEarnV2.connect(user).claimAllStakingRewards();
    await tx.wait();
    console.log("✅ Successfully claimed all staking rewards");
    
    // Check user balance after claiming
    const balanceAfter = await movinToken.balanceOf(user.address);
    console.log(`User balance after claiming: ${ethers.formatEther(balanceAfter)} MOVIN`);
    
    const actualReward = balanceAfter - balanceBefore;
    console.log(`Actual reward received: ${ethers.formatEther(actualReward)} MOVIN`);
    
    // Verify all stakes have updated lastClaimed timestamps
    let allTimestampsUpdated = true;
    
    // Get the latest block timestamp to compare against
    const latestBlock = await ethers.provider.getBlock("latest");
    if (!latestBlock || !latestBlock.timestamp) {
      console.log("❌ Could not get latest block timestamp for verification");
      allTimestampsUpdated = false;
    } else {
      const blockTimestamp = latestBlock.timestamp;
      console.log(`Current blockchain timestamp: ${blockTimestamp}`);
      
      for (let i = 0; i < updatedStakeCount; i++) {
        const stake = await movinEarnV2.connect(user).getUserStake(i);
        const oldLastClaimed = Number(stake.lastClaimed);
        
        // The lastClaimed should be very close to the current block timestamp
        const timeDiff = Math.abs(Number(stake.lastClaimed) - blockTimestamp);
        
        if (timeDiff > 5) { // Allow small difference due to execution order
          allTimestampsUpdated = false;
          console.log(`❌ Stake ${i} lastClaimed timestamp not properly updated. Expected ~${blockTimestamp}, got ${stake.lastClaimed} (diff: ${timeDiff} seconds)`);
        } else {
          console.log(`✅ Stake ${i} lastClaimed properly updated to ${stake.lastClaimed}`);
        }
      }
    }
    
    if (allTimestampsUpdated) {
      console.log("✅ All stakes' lastClaimed timestamps were properly updated");
    }
    
    // Try claiming again (should fail or claim 0)
    console.log("\nTesting second claim (should fail or claim 0):");
    try {
      const tx2 = await movinEarnV2.connect(user).claimAllStakingRewards();
      await tx2.wait();
      console.log("Second claim succeeded, checking if rewards were 0...");
      
      const balanceAfterSecondClaim = await movinToken.balanceOf(user.address);
      if (balanceAfterSecondClaim === balanceAfter) {
        console.log("✅ Second claim didn't transfer any tokens as expected");
      } else {
        console.log(`❓ Second claim transferred ${ethers.formatEther(balanceAfterSecondClaim - balanceAfter)} tokens`);
      }
    } catch (error: any) {
      if (error.message.includes("NoRewardsAvailable")) {
        console.log("✅ Second claim failed as expected (NoRewardsAvailable)");
      } else {
        console.log(`❌ Second claim failed with unexpected error: ${error.message.split('\n')[0]}`);
      }
    }
    
    console.log("\n✅ Claim all staking rewards testing completed");
  } catch (error) {
    console.error("❌ Error testing claimAllStakingRewards functionality:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
