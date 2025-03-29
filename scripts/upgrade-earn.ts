import { ethers, upgrades } from "hardhat";
import { Log } from "@ethersproject/abstract-provider";

// Constants for testing on local network
const MOVIN_EARN_PROXY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

// Base chain
// const MOVIN_EARN_PROXY_ADDRESS = "0x865E693ebd875eD997BeEc565CFfBbE687Ee5776";

const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// List of known user addresses to migrate (useful for local testing)
// This will be populated by scanning events, but can be hardcoded for local testing
const KNOWN_USER_ADDRESSES: string[] = [
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", // Example user address
];

async function main() {
  console.log("Upgrading MOVINEarn contract to V2...");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  try {
    // Get the new implementation contract factory
    const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
    
    console.log("Upgrading MOVINEarn proxy at:", MOVIN_EARN_PROXY_ADDRESS);
    
    // Standard upgrade without storage layout changes
    const upgraded = await upgrades.upgradeProxy(MOVIN_EARN_PROXY_ADDRESS, MOVINEarnV2);
    
    await upgraded.waitForDeployment();
    const upgradedAddress = await upgraded.getAddress();

    console.log("✅ MOVINEarn proxy upgraded");
    console.log("Proxy address:", upgradedAddress);
    console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(upgradedAddress));
    
    // Now explicitly call initializeV2 to properly initialize V2-specific state
    console.log("Initializing V2 functionality...");
    const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", upgradedAddress);
    try {
      await movinEarnV2.initializeV2();
      console.log("✅ V2 initialization completed successfully");
    } catch (error: any) {
      console.log("❌ V2 initialization failed or not needed. This may be expected if already initialized.");
      console.log("Error:", error.message);
    }
    
    // Begin comprehensive migration of user data
    console.log("\n--- 🔄 Beginning User Data Migration ---");
    
    // Get users from contract events for migration
    const userAddresses = await getUserAddressesFromEvents(movinEarnV2);
    
    if (userAddresses.length === 0 && KNOWN_USER_ADDRESSES.length > 0) {
      console.log("No users found from events, using hardcoded list for local testing");
      userAddresses.push(...KNOWN_USER_ADDRESSES);
    }
    
    if (userAddresses.length > 0) {
      // Migrate user data in batches
      await migrateUserDataInBatches(movinEarnV2, userAddresses, deployer);
    } else {
      console.log("⚠️ No users found to migrate");
    }
    
    console.log("✅ Upgrade and migration complete");
  } catch (error: any) {
    console.log("❌ Upgrade failed");
    console.log("Error:", error.message);
    process.exitCode = 1;
  }
}

// Function to get all user addresses from contract events
async function getUserAddressesFromEvents(movinEarnV2: any): Promise<string[]> {
  console.log("Scanning for users from contract events...");
  
  // Create a set to store unique addresses
  const uniqueUsers = new Set<string>();
  
  // Try different historical block ranges for local testing
  const blockRanges = [
    { start: -1000, name: "Last 1K blocks" },
    { start: -10000, name: "Last 10K blocks" },
  ];
  
  for (const range of blockRanges) {
    try {
      const blockHeight = await ethers.provider.getBlockNumber();
      const startBlock = Math.max(0, blockHeight + range.start);
      
      console.log(`${range.name}: Scanning blocks ${startBlock} to ${blockHeight}`);
      
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
      
      // Try to get referral events
      try {
        console.log("  Fetching ReferralRegistered events...");
        const referralFilter = movinEarnV2.filters.ReferralRegistered();
        const referralEvents = await movinEarnV2.queryFilter(referralFilter, startBlock, blockHeight);
        
        for (const event of referralEvents) {
          if (event.args && event.args.user) {
            uniqueUsers.add(event.args.user.toLowerCase());
          }
          if (event.args && event.args.referrer) {
            uniqueUsers.add(event.args.referrer.toLowerCase());
          }
        }
        console.log(`  Found ${referralEvents.length} referral events`);
      } catch (error) {
        console.log(`  Error fetching referral events: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      if (uniqueUsers.size > 0) {
        break; // Stop after finding users
      }
    } catch (error) {
      console.error(`Error processing ${range.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  const userAddresses = Array.from(uniqueUsers);
  console.log(`Found ${userAddresses.length} unique users to migrate`);
  
  return userAddresses;
}

// Function to migrate user data in batches
async function migrateUserDataInBatches(movinEarnV2: any, userAddresses: string[], deployer: any) {
  const BATCH_SIZE = 50; // Adjust based on gas limits and testing needs
  const batches = [];
  
  for (let i = 0; i < userAddresses.length; i += BATCH_SIZE) {
    batches.push(userAddresses.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Migrating ${userAddresses.length} users in ${batches.length} batches...`);
  
  let totalSuccesses = 0;
  let totalFailures = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} with ${batch.length} users...`);
    
    try {
      console.log("  User addresses in this batch:");
      batch.forEach((addr, idx) => console.log(`    ${idx + 1}. ${addr}`));
      
      // First attempt to verify some data before migration
      for (const userAddress of batch.slice(0, 3)) { // Check first 3 users in batch for detailed debugging
        try {
          console.log(`\n  Pre-migration data for user ${userAddress}:`);
          
          // Check stake data
          try {
            // Connect with the user's signer before calling functions that use msg.sender
            const userSigner = await ethers.getImpersonatedSigner(userAddress);
            const stakeCount = await movinEarnV2.connect(userSigner).getUserStakeCount();
            console.log(`    Stake count: ${stakeCount}`);
            
            if (stakeCount > 0) {
              const stake = await movinEarnV2.connect(userSigner).getUserStake(0);
              console.log(`    First stake amount: ${ethers.formatEther(stake.amount)} tokens`);
            }
          } catch (error) {
            console.log(`    Error retrieving stake data: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // Check activity data
          try {
            const activity = await movinEarnV2.userActivities(userAddress);
            console.log(`    Pending rewards: ${ethers.formatEther(activity.pendingStepsRewards)} steps, ${ethers.formatEther(activity.pendingMetsRewards)} METs`);
          } catch (error) {
            console.log(`    Error retrieving activity data: ${error instanceof Error ? error.message : String(error)}`);
          }
        } catch (error) {
          console.log(`    Error checking pre-migration data: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Perform the bulk migration
      console.log("\n  Executing bulk migration...");
      const migrationTx = await movinEarnV2.connect(deployer).bulkMigrateUserData(batch);
      const receipt = await migrationTx.wait();
      console.log(`  Migration transaction successful: ${receipt.hash}`);
      
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
          totalSuccesses += successCount;
          totalFailures += (totalUsers - successCount);
          
          console.log(`  ✅ Batch ${i + 1} migration results: ${successCount}/${totalUsers} users successfully migrated`);
        }
      } else {
        console.log(`  ⚠️ No migration events found, unable to verify results`);
      }
      
      // Verify migration for sample users
      for (const userAddress of batch.slice(0, 3)) { // Check first 3 users for verification
        try {
          console.log(`\n  Post-migration data for user ${userAddress}:`);
          
          // Check stake data
          try {
            // Connect with the user's signer before calling functions that use msg.sender
            const userSigner = await ethers.getImpersonatedSigner(userAddress);
            const stakeCount = await movinEarnV2.connect(userSigner).getUserStakeCount();
            console.log(`    Stake count: ${stakeCount}`);
            
            if (stakeCount > 0) {
              const stake = await movinEarnV2.connect(userSigner).getUserStake(0);
              console.log(`    First stake amount: ${ethers.formatEther(stake.amount)} tokens`);
            }
          } catch (error) {
            console.log(`    Error retrieving stake data: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // Check activity data
          try {
            const activity = await movinEarnV2.userActivities(userAddress);
            console.log(`    Pending rewards: ${ethers.formatEther(activity.pendingStepsRewards)} steps, ${ethers.formatEther(activity.pendingMetsRewards)} METs`);
          } catch (error) {
            console.log(`    Error retrieving activity data: ${error instanceof Error ? error.message : String(error)}`);
          }
        } catch (error) {
          console.log(`    Error checking post-migration data: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
    } catch (error: any) {
      console.error(`  ❌ Failed to migrate batch ${i + 1}: ${error.message}`);
      totalFailures += batch.length;
    }
  }
  
  console.log(`\n--- 📊 Migration Summary ---`);
  console.log(`Total users processed: ${userAddresses.length}`);
  console.log(`Successful migrations: ${totalSuccesses}`);
  console.log(`Failed migrations: ${totalFailures}`);
  
  if (totalFailures > 0) {
    console.log(`\n⚠️ WARNING: Some migrations failed. Manual verification recommended.`);
  } else if (totalSuccesses > 0) {
    console.log(`\n✅ All migrations completed successfully!`);
  } else {
    console.log(`\n⚠️ No migrations were processed.`);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exitCode = 1;
}); 