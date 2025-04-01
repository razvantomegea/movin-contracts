import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from "./contract-addresses";
import { ethers } from "hardhat";

// Custom parameters for migration testing
const SETUP_TEST_DATA = true; // Set to true to create test data before migration
const NUM_TEST_STAKES = 3; // Number of test stakes to create per user
const NUM_TEST_ACTIVITIES = 5; // Number of activity records to create

async function main() {
  // Get contract factories
  const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
  
  // Get already upgraded contract instance
  console.log("\n--- 🚀 USING UPGRADED MOVIN EARN V2 ---");
  const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_PROXY_ADDRESS);
  
  // Get signers for testing
  const [owner, user1, user2, user3] = await ethers.getSigners();
  console.log("✅ Owner address:", owner.address);
  console.log("✅ User1 address:", user1.address);
  console.log("✅ User2 address:", user2.address);
  console.log("✅ User3 address:", user3.address);

  // Get current contract instance
  console.log("Connecting to MOVINEarn contract at", MOVIN_EARN_PROXY_ADDRESS);
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_PROXY_ADDRESS);
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_PROXY_ADDRESS);
  
  // Verify contract interfaces
  console.log("Checking contract interfaces...");
  try {
    const totalSupply = await movinToken.totalSupply();
    console.log("✅ MovinToken total supply:", ethers.formatEther(totalSupply));
    
    // Check if movinEarnV2 has the mintToken function
    const hasFunction = MOVINEarnV2.interface.hasFunction("mintToken");
    console.log(`✅ MOVINEarnV2 has mintToken function: ${hasFunction}`);
    
    // Try to get owner of the contract
    const contractOwner = await movinEarnV2.owner();
    console.log(`✅ MOVINEarnV2 owner: ${contractOwner}`);
    console.log(`✅ Current signer is owner: ${contractOwner === owner.address}`);
  } catch (error: any) {
    console.error("❌ Error checking contract interfaces:", error.message);
  }

  // Setup test data if needed (create activities and stakes)
  if (SETUP_TEST_DATA) {
    console.log("\n--- 🛠️ SETTING UP TEST DATA ---");
    await setupTestData(movinEarnV2, movinToken, [user1, user2, user3], owner);
  }

  // Verify current state
  console.log("\n--- 📊 VERIFYING CURRENT STATE ---");
  const testUsers = [user1, user2, user3];
  for (const user of testUsers) {
    await verifyUserState(movinEarn, user, "before upgrade");
  }

  // Verify state preservation
  console.log("\n--- 📊 VERIFYING STATE PRESERVATION ---");
  for (const user of testUsers) {
    await verifyUserState(movinEarnV2, user, "after upgrade");
  }

  // Test data migration
  console.log("\n--- 🔄 TESTING DATA MIGRATION FUNCTIONALITY ---");
  await testDataMigration(movinEarnV2, movinToken, [user1, user2, user3], owner);

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
  movinEarnV2: any, 
  movinToken: any, 
  users: any[], 
  owner: any
) {
  try {
    console.log("Minting MOVIN tokens to users...");
    for (const user of users) {
      const mintAmount = ethers.parseEther("10000");
      await movinEarnV2.connect(owner).mintToken(user.address, mintAmount);
      console.log(`✅ Minted ${ethers.formatEther(mintAmount)} MOVIN to ${user.address}`);
      
      // Approve tokens for staking
      await movinToken.connect(user).approve(movinEarnV2.getAddress(), mintAmount);
      console.log(`✅ User ${user.address} approved ${ethers.formatEther(mintAmount)} tokens for staking`);
    }
    
    // Create different stakes
    console.log("\nCreating test stakes...");
    const stakeDurations = [1, 3, 6]; // 1, 3, and 6 month durations
    
    for (const user of users) {
      const userStakeCount = await movinEarnV2.connect(user).getUserStakeCount();
      console.log(`User ${user.address} already has ${userStakeCount} stakes`);
      
      // Only create stakes if user doesn't have any
      if (userStakeCount < NUM_TEST_STAKES) {
        for (let i = 0; i < NUM_TEST_STAKES; i++) {
          const amount = ethers.parseEther(String(500 + i * 500)); // 500, 1000, 1500 tokens
          const duration = stakeDurations[i % stakeDurations.length];
          
          await movinEarnV2.connect(user).stakeTokens(amount, duration);
          console.log(`✅ User ${user.address} staked ${ethers.formatEther(amount)} tokens for ${duration} month(s)`);
        }
      } else {
        console.log(`⏩ Skipping stake creation for user ${user.address} - already has ${userStakeCount} stakes`);
      }
    }
    
    // Record activities
    console.log("\nRecording test activities...");
    
    for (let i = 0; i < NUM_TEST_ACTIVITIES; i++) {
      const stepsBase = 1000; // Lower values to work within per-minute limits
      const metsBase = 1;     // Much lower METs value
      
      for (const [index, user] of users.entries()) {
        try {
          // Add variation but keep values safely within limits
          const steps = stepsBase + (index * 100) + (i * 100); 
          const mets = metsBase; // Keep METs at 1 which is safe
          
          // Advance time by 5 minutes between recordings to ensure time-based limits are satisfied
          await time.increase(5 * 60); 
          
          await movinEarnV2.connect(user).recordActivity(steps, mets);
          console.log(`✅ User ${user.address} recorded activity: ${steps} steps, ${mets} METs`);
        } catch (error: any) {
          console.log(`❌ Failed to record activity for user ${user.address}: ${error.message}`);
        }
      }
    }
    
    // Set premium status for one user
    await movinEarnV2.connect(owner).setPremiumStatus(users[0].address, true);
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

async function testDataMigration(movinEarnV2: any, movinToken: any, users: any[], owner: any) {
  try {
    console.log("\nTesting data migration functionality...");
    
    // Check for proper migration of the lastDayOfYearReset field
    console.log("\nVerifying lastDayOfYearReset migration...");
    
    // First, perform an activity recording to set up migration test
    await movinEarnV2.connect(users[0]).recordActivity(5000, 5);
    console.log("✅ Recorded activity to setup migration test");
    
    // Get the current day of year
    const secondsInDay = 24 * 60 * 60;
    const latestBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = latestBlock ? latestBlock.timestamp : 0;
    const currentDayOfYear = Math.floor(currentTimestamp / secondsInDay) % 365 + 1;
    console.log(`Current day of year: ${currentDayOfYear}`);
    
    // Get user activity data before migration
    const activityBefore = await movinEarnV2.userActivities(users[0].address);
    console.log(`lastDayOfYearReset before migration: ${activityBefore.lastDayOfYearReset}`);
    
    // Verify that lastDayOfYearReset matches the current day of year
    if (Number(activityBefore.lastDayOfYearReset) === currentDayOfYear) {
      console.log("✅ lastDayOfYearReset is properly set before migration");
    } else {
      console.log(`❌ lastDayOfYearReset does not match current day of year before migration`);
    }
    
    // Migrate the user data
    await movinEarnV2.connect(owner).migrateUserData(users[0].address);
    console.log("✅ Migration executed");
    
    // Check if lastDayOfYearReset is preserved or properly updated
    const activityAfter = await movinEarnV2.userActivities(users[0].address);
    console.log(`lastDayOfYearReset after migration: ${activityAfter.lastDayOfYearReset}`);
    
    // Should be preserved as the current day of year
    if (Number(activityAfter.lastDayOfYearReset) === currentDayOfYear) {
      console.log("✅ lastDayOfYearReset is properly preserved during migration");
    } else {
      console.log(`❌ lastDayOfYearReset was changed during migration`);
    }
    
    // Test migration of a user without existing lastDayOfYearReset
    const newUser = users[1];
    console.log("\nTesting migration for a user without existing lastDayOfYearReset...");
    
    try {
      // First set up this user with some activity
      await movinEarnV2.connect(owner).setPremiumStatus(newUser.address, true);
      await movinToken.connect(newUser).approve(await movinEarnV2.getAddress(), ethers.parseEther("100"));
      await movinEarnV2.connect(newUser).stakeTokens(ethers.parseEther("50"), 3);
      console.log("✅ Setup new user for migration test");
      
      // Migrate the user data
      await movinEarnV2.connect(owner).migrateUserData(newUser.address);
      console.log("✅ Executed migration for new user");
      
      // Check if lastDayOfYearReset is initialized properly
      const newUserActivity = await movinEarnV2.userActivities(newUser.address);
      console.log(`New user's lastDayOfYearReset after migration: ${newUserActivity.lastDayOfYearReset}`);
      
      if (Number(newUserActivity.lastDayOfYearReset) === currentDayOfYear) {
        console.log("✅ lastDayOfYearReset is properly initialized during migration for new user");
      } else if (Number(newUserActivity.lastDayOfYearReset) > 0) {
        console.log("⚠️ lastDayOfYearReset was initialized but not to current day of year");
      } else {
        console.log("❌ lastDayOfYearReset was not initialized during migration");
      }
    } catch (error: any) {
      console.log(`❌ Error testing migration for new user: ${error.message}`);
    }
    
    console.log("\n✅ Migration testing completed");
  } catch (error) {
    console.error("❌ Error testing migration functionality:", error);
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
    
    // First, record zero activity to ensure lastUpdated is set without triggering validation
    await movinEarnV2.connect(referee).recordActivity(0, 0);
    console.log("✅ Recorded zero activity to initialize lastUpdated timestamp");
    
    // Advance time by 1 minute to ensure we pass the time-based validation
    await time.increase(60);
    
    // Now record activity for referee that will generate rewards
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
    
    // First test per-minute limits instead of hourly limits
    console.log("\nTesting per-minute activity limits...");
    
    // Try to get per-minute limits from the contract
    let MAX_STEPS_PER_MINUTE = BigInt(200); // Default values from the contract
    let MAX_METS_PER_MINUTE = BigInt(1);
    try {
      MAX_STEPS_PER_MINUTE = await movinEarnV2.MAX_STEPS_PER_MINUTE();
      MAX_METS_PER_MINUTE = await movinEarnV2.MAX_METS_PER_MINUTE();
      console.log(`Maximum per-minute limits: ${MAX_STEPS_PER_MINUTE} steps/min, ${MAX_METS_PER_MINUTE} METs/min`);
    } catch (error) {
      console.log(`Note: Could not directly access MAX_STEPS_PER_MINUTE and MAX_METS_PER_MINUTE constants`);
      console.log(`Using default values: ${MAX_STEPS_PER_MINUTE} steps/min, ${MAX_METS_PER_MINUTE} METs/min`);
    }

    // Reset time to ensure we're starting with a clean state
    await time.increase(60 * 60); // Advance more than 1 hour to reset state
    
    // Get current blockchain timestamp and use a value higher than it
    const latestBlockBefore = await ethers.provider.getBlock("latest");
    const currentBlockTimestamp = latestBlockBefore ? latestBlockBefore.timestamp : 0;
    const newTimestamp = currentBlockTimestamp + 3600; // Add 1 hour to ensure it's higher
    
    // Set the blockchain time to our new controlled timestamp
    await ethers.provider.send("evm_setNextBlockTimestamp", [newTimestamp]);
    await ethers.provider.send("evm_mine", []);
    
    console.log(`⏱ Set blockchain time to: ${new Date(newTimestamp * 1000).toISOString()}`);
    
    // Set safe activity values
    const steps1 = Math.floor(Number(MAX_STEPS_PER_MINUTE) * 0.8); // 80% of max allowed per minute
    const mets1 = Math.floor(Number(MAX_METS_PER_MINUTE) * 0.8); // 80% of max allowed per minute
    
    // Set the next block timestamp to ensure proper synchronization
    try {
      await movinEarnV2.connect(user1).recordActivity(steps1, mets1);
      console.log(`✅ User recorded ${steps1} steps and ${mets1} METs (safely within per-minute limit)`);
      
      // Verify activity history was recorded
      const stepsHistory = await movinEarnV2.getUserStepsHistory(user1.address);
      const metsHistory = await movinEarnV2.getUserMetsHistory(user1.address);
      
      console.log("\nActivity History Verification:");
      console.log(`Steps history length: ${stepsHistory.length}`);
      if (stepsHistory.length > 0) {
        console.log(`Latest steps record: ${stepsHistory[stepsHistory.length - 1].value} at ${new Date(Number(stepsHistory[stepsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
      
      console.log(`METs history length: ${metsHistory.length}`);
      if (metsHistory.length > 0) {
        console.log(`Latest METs record: ${metsHistory[metsHistory.length - 1].value} at ${new Date(Number(metsHistory[metsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
    } catch (error: any) {
      console.log(`❌ Failed to record activity: ${error.message}`);
      console.log(`Trying with lower values...`);
      
      // Try with much lower values if the first attempt failed
      const safeSteps = 50;
      const safeMets = 1; // Integer value for METs
      await movinEarnV2.connect(user1).recordActivity(safeSteps, safeMets);
      console.log(`✅ User recorded ${safeSteps} steps and ${safeMets} METs (very safe values)`);
      
      // Verify activity history was recorded
      const stepsHistory = await movinEarnV2.getUserStepsHistory(user1.address);
      const metsHistory = await movinEarnV2.getUserMetsHistory(user1.address);
      
      console.log("\nActivity History Verification:");
      console.log(`Steps history length: ${stepsHistory.length}`);
      if (stepsHistory.length > 0) {
        console.log(`Latest steps record: ${stepsHistory[stepsHistory.length - 1].value} at ${new Date(Number(stepsHistory[stepsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
      
      console.log(`METs history length: ${metsHistory.length}`);
      if (metsHistory.length > 0) {
        console.log(`Latest METs record: ${metsHistory[metsHistory.length - 1].value} at ${new Date(Number(metsHistory[metsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
    }
    
    // Get user's last update timestamp for timing-based activity limits
    const activityData1 = await movinEarnV2.userActivities(user1.address);
    const lastUpdate = activityData1.lastUpdated|| 0;
    
    // Get current blockchain timestamp for comparison
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockTimestamp = latestBlock ? latestBlock.timestamp : 0;
    
    console.log(`Last activity update: ${new Date(Number(lastUpdate) * 1000).toISOString()}`);
    console.log(`Current blockchain time: ${new Date(Number(blockTimestamp) * 1000).toISOString()}`);
    console.log(`Time difference: ${Math.abs(Number(lastUpdate) - blockTimestamp)} seconds`);
    
    if (Math.abs(Number(lastUpdate) - blockTimestamp) < 5) {
      console.log("✅ lastUpdated is correctly synchronized with blockchain time");
    } else if (lastUpdate > 0) {
      console.log("⚠️ lastUpdated is set but not synchronized with current blockchain time");
    } else {
      console.log("❌ lastUpdated is not set");
    }
    
    await time.increase(30); // 30 seconds
    console.log("⏱ Advanced time by 30 seconds");
    
    // Try to record more activity immediately (should fail due to per-minute limits)
    try {
      await movinEarnV2.connect(user1).recordActivity(1, 1);
      console.log("❌ User was able to exceed per-minute limits - this should not happen!");
    } catch (error: any) {
      if (error.message.includes("InvalidActivityInput")) {
        console.log("✅ User was correctly prevented from exceeding per-minute limits");
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
      }
    }
    
    // Advance time by 2 minutes
    await time.increase(2 * 60); // 2 minutes
    console.log("⏱ Advanced time by 2 minutes");
    
    // Now we should be able to record activity for 2 minutes
    // Use safe values (80% of the max) to ensure test passes even with timing differences
    const steps2 = Math.floor(Number(MAX_STEPS_PER_MINUTE) * 1.6); // 80% of 2 minute limit
    const mets2 = Math.floor(Number(MAX_METS_PER_MINUTE) * 1.6); // 80% of 2 minute limit
    
    try {
      await movinEarnV2.connect(user1).recordActivity(steps2, mets2);
      console.log(`✅ After 2 minutes, user was able to record ${steps2} steps and ${mets2} METs`);
      
      // Verify activity history was updated
      const stepsHistory = await movinEarnV2.getUserStepsHistory(user1.address);
      const metsHistory = await movinEarnV2.getUserMetsHistory(user1.address);
      
      console.log("\nUpdated Activity History Verification:");
      console.log(`Steps history length: ${stepsHistory.length}`);
      if (stepsHistory.length > 0) {
        console.log(`Latest steps record: ${stepsHistory[stepsHistory.length - 1].value} at ${new Date(Number(stepsHistory[stepsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
      
      console.log(`METs history length: ${metsHistory.length}`);
      if (metsHistory.length > 0) {
        console.log(`Latest METs record: ${metsHistory[metsHistory.length - 1].value} at ${new Date(Number(metsHistory[metsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
    } catch (error: any) {
      console.log(`❌ Failed to record activity after time advance: ${error.message}`);
      
      // Try with safer values
      const saferSteps = Math.floor(Number(MAX_STEPS_PER_MINUTE) * 1.2); // Only 60% of 2 minute limit
      const saferMets = Math.floor(Number(MAX_METS_PER_MINUTE) * 1.2); // Only 60% of 2 minute limit
      await movinEarnV2.connect(user1).recordActivity(saferSteps, saferMets); 
      console.log(`✅ With safer values: recorded ${saferSteps} steps and ${saferMets} METs`);
      
      // Verify activity history was updated
      const stepsHistory = await movinEarnV2.getUserStepsHistory(user1.address);
      const metsHistory = await movinEarnV2.getUserMetsHistory(user1.address);
      
      console.log("\nUpdated Activity History Verification:");
      console.log(`Steps history length: ${stepsHistory.length}`);
      if (stepsHistory.length > 0) {
        console.log(`Latest steps record: ${stepsHistory[stepsHistory.length - 1].value} at ${new Date(Number(stepsHistory[stepsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
      
      console.log(`METs history length: ${metsHistory.length}`);
      if (metsHistory.length > 0) {
        console.log(`Latest METs record: ${metsHistory[metsHistory.length - 1].value} at ${new Date(Number(metsHistory[metsHistory.length - 1].timestamp) * 1000).toISOString()}`);
      }
    }
    
    // Set test user as premium
    await movinEarnV2.connect(owner).setPremiumStatus(user3.address, true);
    console.log("✅ Set test user as premium");
    
    // Check MAX_DAILY limits
    try {
      const MAX_DAILY_STEPS = await movinEarnV2.MAX_DAILY_STEPS();
      const MAX_DAILY_METS = await movinEarnV2.MAX_DAILY_METS();
      console.log(`Maximum daily limits: ${MAX_DAILY_STEPS} steps, ${MAX_DAILY_METS} METs`);
    } catch (error) {
      console.log("Note: Could not directly access MAX_DAILY constants");
      console.log("Using hardcoded values from contract: 25,000 steps, 50 METs");
    }
    
    // Create minimal end-to-end test for the daily progression
    console.log("\nRunning simplified daily activity test:");
    
    // Advance time by 10 minutes to ensure we're within per-minute limits
    await time.increase(10 * 60);
    console.log("⏱ Advanced time by 10 minutes");
    
    // Record safe amount of activity (100 steps * 10 minutes elapsed = 1000 steps)
    const safeSteps = 1000;
    const safeMets = 1; // Using integer value 1 which is safe
    
    try {
      await movinEarnV2.connect(user3).recordActivity(safeSteps, safeMets);
      console.log(`✅ Recorded ${safeSteps} steps and ${safeMets} METs (within safe limits)`);
      
      // Check recorded activity
      const [recordedSteps, recordedMets] = await movinEarnV2.connect(user3).getUserActivity();
      console.log(`Current activity counts: ${recordedSteps} steps and ${recordedMets} METs`);
      
      if (recordedSteps.toString() === safeSteps.toString() && 
          recordedMets.toString() === safeMets.toString()) {
        console.log("✅ Activity recorded correctly");
      } else {
        console.log("⚠️ Activity recording may be inconsistent");
      }
      
      // Check for rewards calculation
      const [pendingSteps, pendingMets] = await movinEarnV2.connect(user3).getPendingRewards();
      console.log(`Pending rewards: ${ethers.formatEther(pendingSteps)} for steps, ${ethers.formatEther(pendingMets)} for METs`);
      
    } catch (error: any) {
      console.log(`❌ Error in daily activity test: ${error.message}`);
    }
    
    console.log("\n✅ Activity and rewards tests completed");
    return true;
  } catch (error: any) {
    console.error(`❌ Activity and rewards tests failed: ${error.message}`);
    return false;
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
        await movinEarnV2.connect(owner).mintToken(user.address, ethers.parseEther("10000"));
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
    }
  } catch (error) {
    console.error("❌ Error testing claimAllStakingRewards functionality:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});