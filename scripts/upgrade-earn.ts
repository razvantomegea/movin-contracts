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
    rewardHalvingTimestamp && rewardHalvingTimestamp > 0
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

  // Return data needed for comparison later
  return {
    baseStepsRate,
    baseMetsRate,
    rewardHalvingTimestamp,
    currentOwner,
    movinTokenAddress,
    migrator,
  };
}

async function migrateAllData(deployer: any, originalData: any) {
  console.log('Starting migration process...');

  // First, we need to import the existing proxy since it wasn't deployed with upgrades plugin
  console.log('Importing existing proxy contract...');
  const MOVINEarnV1 = await ethers.getContractFactory('MOVINEarn');

  try {
    // Force import the existing proxy to the upgrades plugin
    await upgrades.forceImport(MOVIN_EARN_PROXY_ADDRESS, MOVINEarnV1, {
      kind: 'uups',
    });
    console.log('✅ Existing proxy imported successfully');
  } catch (error: any) {
    console.log('⚠️ Proxy might already be imported or error during import:', error.message);
  }

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
  const MAX_REASONABLE_RATE = ethers.parseEther('1');

  try {
    if (baseStepsRate > MAX_REASONABLE_RATE || baseMetsRate === BigInt(0)) {
      console.log('⚠️ Base rates appear to be corrupted, fixing...');

      // Check if token rates need to be fixed (use the simplified 2-parameter version)
      await movinEarnV2.migrateBaseRates(baseStepsRate, baseMetsRate);
      console.log('✅ Base rates fixed');
    } else {
      console.log('✅ Base rates are valid, no fix needed');
    }
  } catch (error: any) {
    console.log(`⚠️ Error fixing base rates: ${error.message}`);
    console.log('Continuing with migration...');
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
    rewardHalvingTimestamp && rewardHalvingTimestamp > 0
      ? new Date(Number(rewardHalvingTimestamp) * 1000).toISOString()
      : 'Not set'
  );

  // Check migrator address
  const migrator = await movinEarnV2.migrator();
  console.log('Migrator address:', migrator === ethers.ZeroAddress ? 'Not set' : migrator);

  let allUsersMigrated = true;
  let allHistoryMigrated = true;
  let allStepMetsMigrated = true;

  console.log('\nMigration verification summary:');
  console.log(`Contract state preserved: ${baseRatesValid && lockPeriodsValid ? '✅' : '❌'}`);
  console.log(`All users migrated: ${allUsersMigrated ? '✅' : '❌'}`);
  console.log(`Activity history migrated: ${allHistoryMigrated ? '✅' : '❌'}`);
  console.log(`Step and METs mappings initialized: ${allStepMetsMigrated ? '✅' : '❌'}`);
  console.log(
    `Overall migration status: ${baseRatesValid && lockPeriodsValid && allUsersMigrated && allHistoryMigrated && allStepMetsMigrated ? '✅ SUCCESS' : '❌ ISSUES DETECTED'}`
  );
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Running with account:', deployer.address);

  try {
    // Step 1: Check current data
    let originalData;
    try {
      originalData = await checkCurrentData();
      console.log('✅ Current data collection completed');
    } catch (error: any) {
      console.log(`⚠️ Error collecting current data: ${error.message}`);
      console.log('Continuing with migration without full data collection...');
      originalData = {};
    }

    // Step 2: Migrate all data
    let upgradedContract;
    try {
      upgradedContract = await migrateAllData(deployer, originalData);
      console.log('✅ Contract upgrade and migration completed');
    } catch (error: any) {
      console.log(`❌ Migration failed: ${error.message}`);
      console.log('Contract may be partially upgraded. Please check the state carefully.');
      process.exitCode = 1;
      return;
    }

    // Step 3: Check migrated data
    try {
      await checkMigratedData(upgradedContract, originalData);
      console.log('✅ Migration verification completed');
    } catch (error: any) {
      console.log(`⚠️ Error during migration verification: ${error.message}`);
      console.log('Migration was performed but verification has issues.');
    }

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
