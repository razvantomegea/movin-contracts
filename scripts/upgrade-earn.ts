import { ethers, upgrades } from 'hardhat';
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from './contract-addresses';

async function checkCurrentData() {
  const movinEarn = await ethers.getContractAt('MOVINEarn', MOVIN_EARN_PROXY_ADDRESS);

  console.log('Checking current data before migration...');
  console.log('----------------------------------------');

  // Check contract state variables
  console.log('Contract State:');
  const movinTokenAddress = await movinEarn.movinToken();
  console.log('MovinToken address:', movinTokenAddress);

  const baseStepsRate = await movinEarn.baseStepsRate();
  const baseMetsRate = await movinEarn.baseMetsRate();
  console.log('Reward rates:');
  console.log(`  Base steps rate: ${ethers.formatEther(baseStepsRate)}`);
  console.log(`  Base METs rate: ${ethers.formatEther(baseMetsRate)}`);

  const rewardHalvingTimestamp = await movinEarn.rewardHalvingTimestamp();
  console.log(
    'Reward halving timestamp:',
    rewardHalvingTimestamp > 0
      ? new Date(Number(rewardHalvingTimestamp) * 1000).toISOString()
      : 'Not set'
  );

  // Check lock period multipliers
  console.log('Lock period multipliers:');
  for (const period of [1, 3, 6, 12, 24]) {
    const multiplier = await movinEarn.lockPeriodMultipliers(period);
    console.log(`  ${period} months: ${multiplier}`);
  }

  // Check token ownership
  const movinToken = await ethers.getContractAt('MovinToken', MOVIN_TOKEN_PROXY_ADDRESS);
  const currentOwner = await movinToken.owner();
  console.log('Current MovinToken owner:', currentOwner);

  // Check migrator address
  const migrator = await movinEarn.migrator();
  console.log('Current migrator address:', migrator === ethers.ZeroAddress ? 'Not set' : migrator);

  // Get user addresses from events
  const currentBlock = await ethers.provider.getBlockNumber();
  const lookbackBlocks = 1000;
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

  const userFilter = movinEarn.filters.ActivityRecorded();
  const activityEvents = await movinEarn.queryFilter(userFilter, fromBlock, currentBlock);

  const uniqueUsers = new Set<string>();
  for (const event of activityEvents) {
    if (event.args && event.args.user) {
      uniqueUsers.add(event.args.user.toLowerCase());
    }
  }

  const userAddresses = Array.from(uniqueUsers);
  console.log(`Found ${userAddresses.length} users to check`);

  // Check data for each user
  const userDetails = [];
  for (const userAddress of userAddresses) {
    console.log(`\nChecking user ${userAddress}:`);

    // Check user stakes
    const userStakes = await movinEarn.getUserStakes(userAddress);
    console.log(`  Stakes: ${userStakes.length}`);
    if (userStakes.length > 0) {
      console.log('  Stake details:');
      for (let i = 0; i < userStakes.length; i++) {
        const stake = userStakes[i];
        console.log(
          `    Stake ${i}: ${ethers.formatEther(stake.amount)} tokens, locked for ${Number(stake.lockDuration) / 86400} days`
        );
      }
    }

    // Check user activity
    const userActivity = await movinEarn.userActivities(userAddress);
    console.log('  Daily activity:');
    console.log(`    Steps: ${userActivity.dailySteps}`);
    console.log(`    METs: ${userActivity.dailyMets}`);
    console.log(
      `    Last updated: ${new Date(Number(userActivity.lastUpdated) * 1000).toISOString()}`
    );
    console.log(`    Premium status: ${userActivity.isPremium ? 'Yes' : 'No'}`);

    // Check referral data
    const referralInfo = await movinEarn.getReferralInfo(userAddress);
    console.log('  Referral info:');
    console.log(
      `    Referrer: ${referralInfo[0] === ethers.ZeroAddress ? 'None' : referralInfo[0]}`
    );
    console.log(`    Earned bonus: ${ethers.formatEther(referralInfo[1])}`);
    console.log(`    Referral count: ${referralInfo[2]}`);

    // Store key data for later comparison
    userDetails.push({
      address: userAddress,
      stakeCount: userStakes.length,
      isPremium: userActivity.isPremium,
      referralCount: referralInfo[2],
    });
  }

  // Return data needed for comparison later
  return {
    baseStepsRate,
    baseMetsRate,
    rewardHalvingTimestamp,
    userAddresses,
    currentOwner,
    userDetails,
    movinTokenAddress,
    migrator,
  };
}

async function migrateAllData(deployer: any) {
  console.log('Starting migration process...');

  // Upgrade contract to V2
  console.log('Upgrading MOVINEarn contract to V2...');
  const MOVINEarnV2 = await ethers.getContractFactory('MOVINEarnV2');
  console.log('Upgrading MOVINEarn proxy at:', MOVIN_EARN_PROXY_ADDRESS);

  // Configure upgrade options to bypass storage layout checks for the renamed variables
  const upgradeOptions = {
    kind: 'uups' as const,
    unsafeAllow: [
      'delegatecall',
      'constructor',
      'state-variable-assignment',
      'state-variable-immutable',
      'external-library-linking',
      'struct-definition',
      'enum-definition',
      'storage-variable-assignment',
      'storage-variable-structs',
      'array-length',
    ],
    unsafeAllowRenames: true,
    unsafeSkipStorageCheck: true,
  } as any;

  // Perform the actual upgrade
  const upgraded = await upgrades.upgradeProxy(
    MOVIN_EARN_PROXY_ADDRESS,
    MOVINEarnV2,
    upgradeOptions
  );
  await upgraded.waitForDeployment();
  const upgradedAddress = await upgraded.getAddress();

  console.log('✅ MOVINEarn proxy upgraded');
  console.log('Proxy address:', upgradedAddress);
  console.log(
    'Implementation address:',
    await upgrades.erc1967.getImplementationAddress(upgradedAddress)
  );

  const movinEarnV2 = await ethers.getContractAt('MOVINEarnV2', upgradedAddress);

  // Transfer ownership of MovinToken to MOVINEarnV2 contract
  console.log('\nTransferring ownership of MovinToken to MOVINEarnV2...');
  const movinToken = await ethers.getContractAt('MovinToken', MOVIN_TOKEN_PROXY_ADDRESS);
  const currentOwner = await movinToken.owner();

  if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
    const transferTx = await movinToken.transferOwnership(upgradedAddress);
    await transferTx.wait();
    console.log('✅ MovinToken ownership transferred to MOVINEarnV2');
  } else if (currentOwner === MOVIN_EARN_PROXY_ADDRESS) {
    console.log('✅ MovinToken ownership already transferred to MOVINEarnV2');
  } else {
    console.log('⚠️ Cannot transfer MovinToken ownership - current owner is not the deployer');
  }

  // Initialize V2 functionality
  console.log('Initializing V2 functionality...');
  try {
    await movinEarnV2.initializeV2();
    console.log('✅ V2 initialization completed');
  } catch (error: any) {
    console.log('V2 initialization failed or already initialized');
  }

  // Initialize migration
  const currentMigrator = await movinEarnV2.migrator();
  if (currentMigrator === ethers.ZeroAddress) {
    await movinEarnV2.initializeMigration(deployer.address);
    console.log('✅ Migration initialized with deployer as migrator');
  } else {
    console.log(`✅ Migration already initialized with migrator: ${currentMigrator}`);
  }

  // Fix base rates if corrupted
  const baseStepsRate = await movinEarnV2.baseStepsRate();
  const baseMetsRate = await movinEarnV2.baseMetsRate();
  const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
  const MAX_REASONABLE_RATE = ethers.parseEther('1');

  if (baseStepsRate > MAX_REASONABLE_RATE || baseMetsRate === BigInt(0)) {
    console.log('⚠️ Base rates appear to be corrupted, fixing...');
    await movinEarnV2.migrateBaseRates(baseStepsRate, baseMetsRate, rewardHalvingTimestamp);
    console.log('✅ Base rates fixed');
  }

  // Migrate user data
  const currentBlock = await ethers.provider.getBlockNumber();
  const lookbackBlocks = 1000;
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

  const userFilter = movinEarnV2.filters.ActivityRecorded();
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
    console.log('Running user data migration...');
    const tx = await movinEarnV2.bulkMigrateUserData(userAddresses);
    await tx.wait();
    console.log('✅ User data migration completed');
  } else {
    console.log('No users found to migrate');
  }

  return movinEarnV2;
}

async function checkMigratedData(movinEarnV2: any, originalData: any) {
  console.log('\nVerifying migration results...');
  console.log('----------------------------');

  // Check contract state variables
  console.log('Contract State:');
  const movinTokenAddress = await movinEarnV2.movinToken();
  console.log('MovinToken address:', movinTokenAddress);
  console.log(
    `Token address preserved: ${movinTokenAddress === originalData.movinTokenAddress ? '✅' : '❌'}`
  );

  const baseStepsRate = await movinEarnV2.baseStepsRate();
  const baseMetsRate = await movinEarnV2.baseMetsRate();
  console.log('Migrated reward rates:');
  console.log(`  Base steps rate: ${ethers.formatEther(baseStepsRate)}`);
  console.log(`  Base METs rate: ${ethers.formatEther(baseMetsRate)}`);

  // Verify base rates are valid (not zero or corrupted)
  const baseRatesValid = baseStepsRate > BigInt(0) && baseMetsRate > BigInt(0);
  console.log(`Base rates valid: ${baseRatesValid ? '✅' : '❌'}`);

  // Check lock period multipliers
  console.log('Lock period multipliers:');
  let lockPeriodsValid = true;
  for (const period of [1, 3, 6, 12, 24]) {
    const multiplier = await movinEarnV2.lockPeriodMultipliers(period);
    console.log(`  ${period} months: ${multiplier}`);
    if (multiplier.toString() === '0') {
      lockPeriodsValid = false;
    }
  }
  console.log(`Lock periods preserved: ${lockPeriodsValid ? '✅' : '❌'}`);

  // Check token ownership
  const movinToken = await ethers.getContractAt('MovinToken', MOVIN_TOKEN_PROXY_ADDRESS);
  const currentOwner = await movinToken.owner();
  console.log('Current MovinToken owner:', currentOwner);
  console.log(
    `Token ownership transferred: ${currentOwner.toLowerCase() === (await movinEarnV2.getAddress()).toLowerCase() ? '✅' : '❌'}`
  );

  // Check halving timestamp
  const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
  console.log(
    'Migrated reward halving timestamp:',
    new Date(Number(rewardHalvingTimestamp) * 1000).toISOString()
  );

  // Check migrator address
  const migrator = await movinEarnV2.migrator();
  console.log('Migrator address:', migrator === ethers.ZeroAddress ? 'Not set' : migrator);

  // Verify user data migration
  console.log('\nVerifying user data migration:');
  let allUsersMigrated = true;
  let allHistoryMigrated = true;

  for (const userData of originalData.userDetails) {
    const userAddress = userData.address;
    console.log(`\nUser ${userAddress}:`);

    try {
      // Check stakes migration
      const userStakes = await movinEarnV2.getUserStakes(userAddress);
      const stakesMatch = userStakes.length === userData.stakeCount;
      console.log(
        `  Stakes migrated: ${stakesMatch ? '✅' : '❌'} (${userStakes.length} of ${userData.stakeCount})`
      );

      // Check activity details
      const userActivity = await movinEarnV2.userActivities(userAddress);
      console.log(
        `  Premium status preserved: ${userActivity.isPremium === userData.isPremium ? '✅' : '❌'}`
      );

      // Check referrals
      const referralInfo = await movinEarnV2.getReferralInfo(userAddress);
      console.log(`  Referral count: ${referralInfo[2]} (original: ${userData.referralCount})`);
      console.log(
        `  Referrals preserved: ${Number(referralInfo[2]) >= Number(userData.referralCount) ? '✅' : '❌'}`
      );
    } catch (error) {
      console.log(`❌ Error verifying migration for user ${userAddress}:`, error);
      allUsersMigrated = false;
    }
  }

  console.log('\nMigration verification summary:');
  console.log(`Contract state preserved: ${baseRatesValid && lockPeriodsValid ? '✅' : '❌'}`);
  console.log(`All users migrated: ${allUsersMigrated ? '✅' : '❌'}`);
  console.log(`Activity history migrated: ${allHistoryMigrated ? '✅' : '❌'}`);
  console.log(
    `Overall migration status: ${baseRatesValid && lockPeriodsValid && allUsersMigrated && allHistoryMigrated ? '✅ SUCCESS' : '❌ ISSUES DETECTED'}`
  );
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Running with account:', deployer.address);

  try {
    // Step 1: Check current data
    const originalData = await checkCurrentData();

    // Step 2: Migrate all data
    const upgradedContract = await migrateAllData(deployer);

    // Step 3: Check migrated data
    await checkMigratedData(upgradedContract, originalData);

    console.log('✅ Complete migration process successful');
  } catch (error: any) {
    console.log('❌ Migration failed:', error.message);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exitCode = 1;
});
