import { ethers, upgrades } from "hardhat";

// MOVINEarn proxy address from deployment
const MOVIN_EARN_PROXY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const MOVIN_EARN_BASE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

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
    
    console.log("✅ Upgrade complete");
  } catch (error: any) {
    console.log("❌ Upgrade failed");
    console.log("Error:", error.message);
    process.exitCode = 1;
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exitCode = 1;
}); 