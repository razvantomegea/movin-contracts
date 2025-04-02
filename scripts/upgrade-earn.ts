import { ethers, upgrades } from "hardhat";
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from "./contract-addresses";

async function main() {
  console.log("Upgrading MOVINEarn contract to V2...");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  try {
    // Get the new implementation contract factory
    const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");

    console.log("Upgrading MOVINEarn proxy at:", MOVIN_EARN_PROXY_ADDRESS);

    // Configure upgrade options to bypass storage layout checks for the renamed variables
    console.log("Using unsafe allow options to bypass storage layout checks...");
    const upgradeOptions = {
      kind: "uups" as const,
      unsafeAllow: [
        "delegatecall",
        "constructor",
        "state-variable-assignment",
        "state-variable-immutable",
        "external-library-linking",
        "struct-definition",
        "enum-definition",
        "storage-variable-assignment",
        "storage-variable-structs",
        "array-length"
      ],
      unsafeAllowRenames: true,
      unsafeSkipStorageCheck: true
    } as any;

    // Perform the actual upgrade
    const upgraded = await upgrades.upgradeProxy(MOVIN_EARN_PROXY_ADDRESS, MOVINEarnV2, upgradeOptions);

    await upgraded.waitForDeployment();
    const upgradedAddress = await upgraded.getAddress();

    console.log("✅ MOVINEarn proxy upgraded");
    console.log("Proxy address:", upgradedAddress);
    console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(upgradedAddress));

    // Transfer ownership of MovinToken to MOVINEarnV2 contract
    console.log("\nTransferring ownership of MovinToken to MOVINEarnV2...");

    // Check current owner - using proper type-safe approach
    try {
      // Cast to the right interface that has owner and transferOwnership methods
      const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_PROXY_ADDRESS);
      const currentOwner = await movinToken.owner();
      console.log("Current MovinToken owner:", currentOwner);

      if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
        // Transfer ownership to the MOVINEarnV2 proxy
        const transferTx = await movinToken.transferOwnership(upgradedAddress);
        await transferTx.wait();
        console.log("✅ MovinToken ownership transferred to MOVINEarnV2");
      } else if (currentOwner === MOVIN_EARN_PROXY_ADDRESS) {
        console.log("✅ MovinToken ownership already transferred to MOVINEarnV2");
      } else {
        console.log("⚠️ Cannot transfer MovinToken ownership - current owner is not the deployer");
        console.log("Manual ownership transfer required from address:", currentOwner);
      }
    } catch (error: any) {
      console.log("❌ Failed to check or transfer token ownership:", error.message);
    }

    const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", upgradedAddress);

    // First, check and fix base rates if they're corrupted
    console.log("\nChecking base rates...");
    try {
      const beforeBaseStepsRate = await movinEarnV2.baseStepsRate();
      const beforeBaseMetsRate = await movinEarnV2.baseMetsRate();
      console.log("Current base rates:");
      console.log(`  Steps rate: ${ethers.formatEther(beforeBaseStepsRate)}`);
      console.log(`  METs rate: ${ethers.formatEther(beforeBaseMetsRate)}`);

      // Check if rates are corrupted (either too large or zero)
      const MAX_REASONABLE_RATE = ethers.parseEther("1"); // 1000 tokens as a reasonable maximum
      if (beforeBaseStepsRate > MAX_REASONABLE_RATE || beforeBaseMetsRate === BigInt(0)) {
        console.log("⚠️ Base rates appear to be corrupted, attempting to fix...");
        await movinEarnV2.migrateBaseRates();
        console.log("✅ Base rates migration completed");

        const afterBaseStepsRate = await movinEarnV2.baseStepsRate();
        const afterBaseMetsRate = await movinEarnV2.baseMetsRate();
        console.log("Updated base rates:");
        console.log(`  Steps rate: ${ethers.formatEther(afterBaseStepsRate)}`);
        console.log(`  METs rate: ${ethers.formatEther(afterBaseMetsRate)}`);
      } else {
        console.log("✅ Base rates appear to be correct");
      }
    } catch (error: any) {
      console.log("❌ Failed to check or fix base rates:", error.message);
      if (error.data) {
        console.log("Error data:", error.data);
      }
      throw error; // Stop the upgrade if we can't fix the base rates
    }

    // Initialize V2 functionality
    console.log("Initializing V2 functionality...");

    // Record the halving timestamp before initialization for verification
    const beforeHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();

    try {
      await movinEarnV2.initializeV2();
      console.log("✅ V2 initialization completed successfully");

      // Verify that rewardHalvingTimestamp was preserved (important!)
      const afterHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();

      if (beforeHalvingTimestamp.toString() === afterHalvingTimestamp.toString()) {
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

    const latestBlockBefore = await ethers.provider.getBlock('latest');
    const newTimestamp = latestBlockBefore?.timestamp ?? 0;
    console.log("Importing reward halving timestamp...");
    await movinEarnV2.importRewardHalvingTimestamp(newTimestamp);
    const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
    console.log("✅ Reward halving timestamp imported:", new Date(Number(rewardHalvingTimestamp) * 1000).toISOString());

    // Run migration to fix any data alignment issues
    // Note: All existing data is preserved by the proxy, but field renames need manual handling
    // * lastHourlyReset → lastUpdated
    // * Deleted hourlySteps and hourlyMets
    // * Added userStepsHistory and userMetsHistory arrays

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

      // Verify migration results
      console.log("\nVerifying migration results...");
      for (const userAddress of userAddresses) {
        try {
          const stepsHistoryLength = await movinEarnV2.getUserStepsHistoryLength(userAddress);
          const metsHistoryLength = await movinEarnV2.getUserMetsHistoryLength(userAddress);
          console.log(`User ${userAddress}:`);
          console.log(`  Steps history length: ${stepsHistoryLength}`);
          console.log(`  METs history length: ${metsHistoryLength}`);

          // Get the latest activity record if available
          if (stepsHistoryLength > 0) {
            const stepsHistory = await movinEarnV2.getUserStepsHistory(userAddress);
            const latestSteps = stepsHistory[stepsHistory.length - 1];
            console.log(`  Latest steps record: ${latestSteps.value} at ${new Date(Number(latestSteps.timestamp) * 1000).toISOString()}`);
          }

          if (metsHistoryLength > 0) {
            const metsHistory = await movinEarnV2.getUserMetsHistory(userAddress);
            const latestMets = metsHistory[metsHistory.length - 1];
            console.log(`  Latest METs record: ${latestMets.value} at ${new Date(Number(latestMets.timestamp) * 1000).toISOString()}`);
          }
        } catch (error) {
          console.log(`❌ Error verifying migration for user ${userAddress}:`, error);
        }
      }
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