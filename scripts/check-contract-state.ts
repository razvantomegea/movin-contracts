import { ethers } from "hardhat";

// The proxy address on our local Hardhat node
const MOVIN_EARN_PROXY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
// We'll fetch the implementation address
const EXPECTED_IMPLEMENTATION_ADDRESS = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";

async function main() {
  console.log("Checking MOVINEarnV2 contract state on local node...");
  
  // Get signer
  const [deployer, user1, user2] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`User1 address: ${user1.address}`);
  console.log(`User2 address: ${user2.address}`);
  
  try {
    // Get the contract
    const movinEarnV2 = await ethers.getContractAt("MOVINEarnV2", MOVIN_EARN_PROXY_ADDRESS);
    console.log(`Connected to MOVINEarnV2 at ${MOVIN_EARN_PROXY_ADDRESS}`);
    
    // Check if the contract is properly upgraded by calling V2-specific functions
    try {
      // Check implementation address
      const implementation = await ethers.provider.getStorage(
        MOVIN_EARN_PROXY_ADDRESS, 
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
      );
      const implementationAddress = `0x${implementation.slice(26)}`;
      console.log(`Current implementation address: ${implementationAddress}`);
      
      // Verify implementation matches expected
      if (implementationAddress.toLowerCase() === EXPECTED_IMPLEMENTATION_ADDRESS.toLowerCase()) {
        console.log("✅ Implementation address matches expected address");
      } else {
        console.log(`⚠️ Implementation address does not match expected address (${EXPECTED_IMPLEMENTATION_ADDRESS})`);
      }
      
      // Try to get the reward rates
      const baseStepsRate = await movinEarnV2.baseStepsRate();
      const baseMetsRate = await movinEarnV2.baseMetsRate();
      console.log(`Base steps rate: ${ethers.formatEther(baseStepsRate)} MOVIN`);
      console.log(`Base mets rate: ${ethers.formatEther(baseMetsRate)} MOVIN`);
      
      // Check reward halving timestamp
      const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
      console.log(`Reward halving timestamp: ${rewardHalvingTimestamp} (${new Date(Number(rewardHalvingTimestamp) * 1000).toISOString()})`);
      
      // Check contract owner
      const owner = await movinEarnV2.owner();
      console.log(`Contract owner: ${owner}`);
      
      // Check User1 data
      console.log(`\nChecking User1 (${user1.address}) data:`);
      
      // Check stake data
      const user1Stakes = await movinEarnV2.getUserStakes(user1.address);
      console.log(`User1 has ${user1Stakes.length} stakes`);
      
      // Check activity data
      const user1Activity = await movinEarnV2.userActivities(user1.address);
      console.log(`User1 activity data:
- Daily steps: ${user1Activity.dailySteps}
- Daily mets: ${user1Activity.dailyMets}
- Pending steps rewards: ${ethers.formatEther(user1Activity.pendingStepsRewards)} MOVIN
- Pending mets rewards: ${ethers.formatEther(user1Activity.pendingMetsRewards)} MOVIN
- Is Premium: ${user1Activity.isPremium}`);
      
      // Check User2 data
      console.log(`\nChecking User2 (${user2.address}) data:`);
      
      // Check stake data
      const user2Stakes = await movinEarnV2.getUserStakes(user2.address);
      console.log(`User2 has ${user2Stakes.length} stakes`);
      
      // Check activity data
      const user2Activity = await movinEarnV2.userActivities(user2.address);
      console.log(`User2 activity data:
- Daily steps: ${user2Activity.dailySteps}
- Daily mets: ${user2Activity.dailyMets}
- Pending steps rewards: ${ethers.formatEther(user2Activity.pendingStepsRewards)} MOVIN
- Pending mets rewards: ${ethers.formatEther(user2Activity.pendingMetsRewards)} MOVIN
- Is Premium: ${user2Activity.isPremium}`);
      
      // Check referral data
      console.log(`\nChecking referral data:`);
      try {
        const referralInfo = await movinEarnV2.userReferrals(user2.address);
        console.log(`User2 referral data:
- Referrer: ${referralInfo.referrer}
- Earned bonus: ${ethers.formatEther(referralInfo.earnedBonus)} MOVIN
- Referral count: ${referralInfo.referralCount}`);
      } catch (error) {
        console.log(`Failed to get referral data: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error(`Failed to check contract state: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log("\n🎉 Contract state check completed!");
  } catch (error) {
    console.error(`❌ Failed to connect to contract: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 