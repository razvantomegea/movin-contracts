import { ethers } from "hardhat";
import { MOVIN_EARN_PROXY_ADDRESS } from "./contract-addresses";


async function main() {
  console.log("Fetching users from MOVINEarnV2 contract on local node...");
  
  // Get contract
  const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_PROXY_ADDRESS);
  
  // Use smaller block ranges for local node which has fewer blocks
  const blockRanges = [
    { start: -100, name: "Last 100 blocks" },
    { start: -500, name: "Last 500 blocks" },
    { start: -1000, name: "Last 1K blocks" },
    { start: -5000, name: "Last 5K blocks" }
  ];
  
  for (const range of blockRanges) {
    try {
      const blockHeight = await ethers.provider.getBlockNumber();
      const startBlock = Math.max(0, blockHeight + range.start);
      
      console.log(`\n${range.name}: Scanning blocks ${startBlock} to ${blockHeight}`);
      
      // Create a set to store unique addresses
      const uniqueUsers = new Set<string>();
      
      // Try to get staking events
      try {
        console.log("  Fetching Staked events...");
        const stakeFilter = movinEarnV2.filters.Staked();
        const stakeEvents = await movinEarnV2.queryFilter(stakeFilter, startBlock, blockHeight);
        
        for (const event of stakeEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${stakeEvents.length} staking events`);
      } catch (error) {
        console.log(`  Error fetching staking events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Try to get activity events
      try {
        console.log("  Fetching ActivityRecorded events...");
        const activityFilter = movinEarnV2.filters.ActivityRecorded();
        const activityEvents = await movinEarnV2.queryFilter(activityFilter, startBlock, blockHeight);
        
        for (const event of activityEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${activityEvents.length} activity events`);
      } catch (error) {
        console.log(`  Error fetching activity events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Check for V2-specific events - look for different event types
      try {
        // Try with BulkMigrationCompleted
        console.log("  Fetching BulkMigrationCompleted events (V2)...");
        const migrationFilter = movinEarnV2.filters.BulkMigrationCompleted?.() || movinEarnV2.filters.UserDataMigrated?.();
        if (migrationFilter) {
          const migrationEvents = await movinEarnV2.queryFilter(migrationFilter, startBlock, blockHeight);
          console.log(`  Found ${migrationEvents.length} migration events`);
        } else {
          console.log("  Migration events not supported by the contract");
        }
      } catch (error) {
        console.log(`  Error fetching migration events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Output results
      const userAddresses = Array.from(uniqueUsers);
      console.log(`  ${range.name}: Found ${userAddresses.length} unique users`);
      
      if (userAddresses.length > 0) {
        console.log("\nUser addresses found:");
        
        // Print addresses with index
        userAddresses.forEach((addr, index) => {
          console.log(`  ${index + 1}. "${addr}",`);
        });
        
        // Check if users have any data in the V2 contract
        console.log("\nVerifying user data in MOVINEarnV2:");
        
        for (const userAddress of userAddresses.slice(0, Math.min(5, userAddresses.length))) {
          try {
            // Get user signer
            const userSigner = await ethers.getImpersonatedSigner(userAddress);
            
            // Check for stakes
            const stakeCount = await movinEarnV2.connect(userSigner).getUserStakeCount();
            
            // Check for premium status
            const isPremium = await movinEarnV2.getIsPremiumUser(userAddress);
            
            // Check for V2-specific data
            const referralInfo = await movinEarnV2.getReferralInfo(userAddress);
            
            console.log(`\nUser ${userAddress}:`);
            console.log(`  - Stakes: ${stakeCount}`);
            console.log(`  - Premium: ${isPremium}`);
            console.log(`  - Referrer: ${referralInfo[0] === ethers.ZeroAddress ? 'None' : referralInfo[0]}`);
            console.log(`  - Referred users: ${referralInfo[1]}`);
            
            if (stakeCount > 0) {
              const firstStake = await movinEarnV2.connect(userSigner).getUserStake(0);
              console.log(`  - Sample stake: Amount ${ethers.formatEther(firstStake.amount)} MOVIN, Lock duration: ${Number(firstStake.lockDuration) / (24 * 60 * 60)} days`);
            }
            
            // Get activity data
            try {
              const [steps, mets] = await movinEarnV2.connect(userSigner).getUserActivity();
              const [pendingStepsReward, pendingMetsReward] = await movinEarnV2.connect(userSigner).getPendingRewards();
              
              console.log(`  - Daily activity: ${steps} steps, ${mets} METs`);
              console.log(`  - Pending rewards: ${ethers.formatEther(pendingStepsReward)} MOVIN for steps, ${ethers.formatEther(pendingMetsReward)} MOVIN for METs`);
            } catch (error) {
              console.log(`  - Error accessing activity data: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            console.log(`  ✅ User data successfully retrieved from V2 contract`);
          } catch (error) {
            console.log(`\n❌ Error verifying data for ${userAddress}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        break;
      }
    } catch (error) {
      console.error(`  Error processing ${range.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 