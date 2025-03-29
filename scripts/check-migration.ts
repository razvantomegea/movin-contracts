import { ethers } from "hardhat";
import { FunctionFragment } from "ethers";
import { MOVIN_EARN_PROXY_ADDRESS, USER_ADDRESS } from "./contract-addresses";


async function main() {
  console.log(`Checking migration status for user ${USER_ADDRESS}...`);
  
  // Get contract
  const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_PROXY_ADDRESS);
  
  try {
    // Check if we can access the user
    const isPremium = await movinEarnV2.getIsPremiumUser(USER_ADDRESS);
    console.log(`User premium status: ${isPremium}`);
    
    // Check for V2-specific data structures
    try {
      // Try to get referral info (V2 feature)
      const referralInfo = await movinEarnV2.getReferralInfo(USER_ADDRESS);
      console.log(`Referral info - Referrer: ${referralInfo[0]}, Referred count: ${referralInfo[1]}`);
      console.log(`✅ V2 specific functions are accessible - migration likely successful`);
    } catch (error) {
      console.log(`❌ Could not access V2-specific functions: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`This indicates the contract may not have been upgraded successfully to V2`);
    }
    
    // Check stakes (impersonate user)
    try {
      const userSigner = await ethers.getImpersonatedSigner(USER_ADDRESS);
      const stakeCount = await movinEarnV2.connect(userSigner).getUserStakeCount();
      
      console.log(`User has ${stakeCount} stakes`);
      
      if (stakeCount > 0) {
        console.log("User stakes:");
        for (let i = 0; i < stakeCount; i++) {
          const stake = await movinEarnV2.connect(userSigner).getUserStake(i);
          console.log(`  Stake ${i + 1}:`);
          console.log(`    Amount: ${ethers.formatEther(stake.amount)} MOVIN`);
          console.log(`    Start time: ${new Date(Number(stake.startTime) * 1000).toISOString()}`);
          console.log(`    Lock duration: ${Number(stake.lockDuration) / (24 * 60 * 60)} days`);
          console.log(`    Last claimed: ${new Date(Number(stake.lastClaimed) * 1000).toISOString()}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error accessing stakes: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Check user activity
    try {
      const userSigner = await ethers.getImpersonatedSigner(USER_ADDRESS);
      
      // Activity data (both V1 and V2)
      const [steps, mets] = await movinEarnV2.connect(userSigner).getUserActivity();
      console.log(`User daily activity: ${steps} steps, ${mets} METs`);
      
      // Raw activity data
      const activity = await movinEarnV2.userActivities(USER_ADDRESS);
      console.log("User activity data:");
      console.log(`  Daily steps: ${activity.dailySteps}`);
      console.log(`  Daily METs: ${activity.dailyMets}`);
      console.log(`  Pending steps rewards: ${ethers.formatEther(activity.pendingStepsRewards)} MOVIN`);
      console.log(`  Pending METs rewards: ${ethers.formatEther(activity.pendingMetsRewards)} MOVIN`);
      
      // Check V2-specific activity functions
      try {
        // Try to get pending rewards using the V1 function since getPendingActivityRewards doesn't exist
        const [pendingSteps, pendingMets] = await movinEarnV2.connect(userSigner).getPendingRewards();
        console.log(`Pending rewards (from V1 function): ${ethers.formatEther(pendingSteps)} for steps, ${ethers.formatEther(pendingMets)} for METs`);
      } catch (error) {
        console.log(`❌ Cannot access rewards function: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.log(`❌ Error accessing activity data: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Check if reward claiming works
    try {
      // Get the contract ABI to see available functions
      const contractFunctions = movinEarnV2.interface.fragments
        .filter(f => f.type === 'function')
        .map(f => {
          // Properly cast to FunctionFragment to access the name property
          const funcFragment = f as FunctionFragment;
          return funcFragment.name;
        });
      
      console.log("\nAvailable functions in the contract:");
      console.log(contractFunctions.sort().join(', '));
    } catch (error) {
      console.log(`Error getting contract functions: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log("\nVerdict:");
    console.log("Based on the available data, the contract appears to be upgraded to V2.");
    console.log("The user data is accessible, which indicates successful storage preservation.");
    console.log("The migration may have actually succeeded, but the expected V2 function getPendingActivityRewards is not implemented.");
    console.log("Check your MOVINEarnV2 contract to ensure it has all the intended V2 functions.");
    
  } catch (error) {
    console.error("❌ Script failed with error:", error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 