import { ethers } from "hardhat";
import { MOVIN_EARN_PROXY_ADDRESS, USER_ADDRESS } from "./contract-addresses";

async function main() {
  console.log(`Running post-migration fixes for user ${USER_ADDRESS}...`);
  
  // Get contract and signers
  const [owner] = await ethers.getSigners();
  console.log(`Using owner address: ${owner.address}`);
  
  const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_PROXY_ADDRESS);
  
  try {
    // Migrate user activity to fix potential V1-V2 structure issues
    console.log("\nMigrating user activity data...");
    await movinEarnV2.connect(owner).migrateUserActivity(USER_ADDRESS);
    console.log("✅ Successfully migrated user activity data");
    
    // Test user activity recording with zero values to initialize lastUpdated
    console.log("\nInitializing activity data with zero values...");
    
    // Impersonate user
    const userSigner = await ethers.getImpersonatedSigner(USER_ADDRESS);
    await movinEarnV2.connect(userSigner).recordActivity(0, 0);
    console.log("✅ Successfully initialized activity data with zero values");
    
    // Check activity data
    const [steps, mets] = await movinEarnV2.connect(userSigner).getUserActivity();
    const activity = await movinEarnV2.userActivities(USER_ADDRESS);
    
    console.log("\nCurrent activity data:");
    console.log(`  Daily steps: ${steps}`);
    console.log(`  Daily METs: ${mets}`);
    console.log(`  Last updated: ${new Date(Number(activity.lastUpdated) * 1000).toISOString()}`);
    console.log(`  Last day of year reset: ${activity.lastDayOfYearReset}`);
    
    // Check referral info
    const referralInfo = await movinEarnV2.getReferralInfo(USER_ADDRESS);
    console.log("\nReferral info:");
    console.log(`  Referrer: ${referralInfo[0]}`);
    console.log(`  Earned bonus: ${ethers.formatEther(referralInfo[1])} MOVIN`);
    console.log(`  Referral count: ${referralInfo[2]}`);
    
    // If we can record activity with 0 values, we should now be able to register referrals
    // and properly record real activity
    
    console.log("\n✅ Post-migration fixes completed successfully!");
  } catch (error) {
    console.error("❌ Error during post-migration fixes:", error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 