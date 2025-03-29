import { ethers } from "hardhat";

// Contract address on local node
const MOVIN_EARN_PROXY_ADDRESS = "0x865E693ebd875eD997BeEc565CFfBbE687Ee5776";

async function main() {
  console.log("Fetching users from MOVINEarn contract on local node...");
  
  // Get contract
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_PROXY_ADDRESS);
  
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
        const stakeFilter = movinEarn.filters.Staked();
        const stakeEvents = await movinEarn.queryFilter(stakeFilter, startBlock, blockHeight);
        
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
        const activityFilter = movinEarn.filters.ActivityRecorded();
        const activityEvents = await movinEarn.queryFilter(activityFilter, startBlock, blockHeight);
        
        for (const event of activityEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${activityEvents.length} activity events`);
      } catch (error) {
        console.log(`  Error fetching activity events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Check for unstake events too
      try {
        console.log("  Fetching Unstaked events...");
        const unstakeFilter = movinEarn.filters.Unstaked();
        const unstakeEvents = await movinEarn.queryFilter(unstakeFilter, startBlock, blockHeight);
        
        for (const event of unstakeEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${unstakeEvents.length} unstake events`);
      } catch (error) {
        console.log(`  Error fetching unstake events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Get reward claim events
      try {
        console.log("  Fetching RewardsClaimed events...");
        const rewardsFilter = movinEarn.filters.RewardsClaimed();
        const rewardsEvents = await movinEarn.queryFilter(rewardsFilter, startBlock, blockHeight);
        
        for (const event of rewardsEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${rewardsEvents.length} reward claim events`);
      } catch (error) {
        console.log(`  Error fetching reward claim events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Get staking reward claim events
      try {
        console.log("  Fetching StakingRewardsClaimed events...");
        const stakingRewardsFilter = movinEarn.filters.StakingRewardsClaimed();
        const stakingRewardsEvents = await movinEarn.queryFilter(stakingRewardsFilter, startBlock, blockHeight);
        
        for (const event of stakingRewardsEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
        }
        console.log(`  Found ${stakingRewardsEvents.length} staking reward claims`);
      } catch (error) {
        console.log(`  Error fetching staking reward events: ${error instanceof Error ? error.message : String(error)}`);
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
        
        // Check if users have any stakes or activity data
        console.log("\nVerifying user data:");
        
        for (const userAddress of userAddresses.slice(0, Math.min(5, userAddresses.length))) {
          try {
            // Check for stakes
            const stakes = await movinEarn.getUserStakes(userAddress);
            
            // Check for premium status
            const isPremium = await movinEarn.getIsPremiumUser(userAddress);
            
            console.log(`  User ${userAddress}:`);
            console.log(`    - Stakes: ${stakes.length}`);
            console.log(`    - Premium: ${isPremium}`);
            
            if (stakes.length > 0) {
              const firstStake = stakes[0];
              console.log(`    - Sample stake: Amount ${ethers.formatEther(firstStake.amount)} MOVIN, Lock duration: ${Number(firstStake.lockDuration) / (24 * 60 * 60)} days`);
            }
          } catch (error) {
            console.log(`  Error verifying data for ${userAddress}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        // Break after finding the first range with users
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