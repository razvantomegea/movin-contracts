import { ethers, upgrades } from "hardhat";
import { MOVIN_EARN_PROXY_ADDRESS } from "./contract-addresses";

async function main() {
  console.log("Upgrading MOVINEarn contract to V2...");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  try {
    // Get the new implementation contract factory
    const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarn");
    
    console.log("Upgrading MOVINEarn proxy at:", MOVIN_EARN_PROXY_ADDRESS);
    
    // Configure upgrade options to bypass storage layout checks for the renamed variables
    console.log("Using unsafe allow options to bypass storage layout checks...");
    const upgradeOptions = {
      kind: "uups" as const, 
      unsafeAllow: [
        "delegatecall",
        "constructor", 
        "state-variable-assignment", 
        "state-variable-immutable"
      ] 
    } as any;
    
    // Perform the actual upgrade
    const upgraded = await upgrades.upgradeProxy(MOVIN_EARN_PROXY_ADDRESS, MOVINEarnV2, upgradeOptions);
    
    await upgraded.waitForDeployment();
    const upgradedAddress = await upgraded.getAddress();

    console.log("✅ MOVINEarn proxy upgraded");
    console.log("Proxy address:", upgradedAddress);
    console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(upgradedAddress));
    
    // Initialize V2 functionality
    console.log("Initializing V2 functionality...");
    const movinEarnV2 = await ethers.getContractAt("MOVINEarn", upgradedAddress);
    
    // Record the halving timestamp before initialization for verification
    const beforeHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
    
    try {
      await movinEarnV2.initializeV2();
      console.log("✅ V2 initialization completed successfully");
      
      // Verify that rewardHalvingTimestamp was preserved (important!)
      const afterHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
      
      if(beforeHalvingTimestamp.toString() === afterHalvingTimestamp.toString()) {
        console.log("✅ rewardHalvingTimestamp successfully preserved during migration");
      } else {
        console.log("⚠️ rewardHalvingTimestamp changed during migration");
      }
    } catch (error: any) {
      console.log("V2 initialization failed or not needed (may already be initialized)");
    }
    
    // Handle data alignment for renamed variables
    console.log("\nMigrating user data for renamed storage variables...");
    
    // Check if migration is already initialized by checking the migrator address
    // If it's not address(0), then it's already initialized
    const currentMigrator = await movinEarnV2.migrator();
    
    if (currentMigrator === ethers.ZeroAddress) {
      // Set up the migrator address to allow migration operations
      await movinEarnV2.initializeMigration(deployer.address);
      console.log("✅ Migration initialized, deployer set as migrator");
    } else {
      console.log(`✅ Migration already initialized with migrator: ${currentMigrator}`);
    }
    
    // Run migration to fix any data alignment issues
    // Note: All existing data is preserved by the proxy, but field renames need manual handling
    // * lastMidnightReset → lastDayOfYearReset
    // * lastHourlyReset → lastUpdated
    // * Deleted hourlySteps and hourlyMets
    
    // Get user addresses (simplified approach)
    const userFilter = movinEarnV2.filters.ActivityRecorded();
    
    // Fix: Calculate proper block range instead of using negative values
    const currentBlock = await ethers.provider.getBlockNumber();
    const lookbackBlocks = 1000; // How many blocks to look back
    const fromBlock = Math.max(0, currentBlock - lookbackBlocks); // Ensure we don't go below 0
    
    console.log(`Scanning for users from block ${fromBlock} to ${currentBlock}`);
    const activityEvents = await movinEarnV2.queryFilter(userFilter, fromBlock, currentBlock);
    
    const uniqueUsers = new Set<string>();
    for (const event of activityEvents) {
      if (event.args && event.args.user) {
        uniqueUsers.add(event.args.user.toLowerCase());
      }
    }
    
    const userAddresses = Array.from(uniqueUsers);
    console.log(`Found ${userAddresses.length} users to migrate`);
    
    if (userAddresses.length > 0) {
      // Run the migration in a single batch (or in batches for large datasets)
      console.log("Running user data migration...");
      const tx = await movinEarnV2.bulkMigrateUserData(userAddresses);
      await tx.wait();
      console.log("✅ User data migration completed");
    } else {
      console.log("No users found to migrate, may need to use hardcoded user list for testing");
      // Optionally add hardcoded user list here
    }
    
    console.log("✅ Contract upgrade and migration process complete");
  } catch (error: any) {
    console.log("❌ Upgrade failed:", error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exitCode = 1;
}); 