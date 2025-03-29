import { ethers, upgrades } from "hardhat";

// MovinToken proxy address from deployment
const MOVIN_TOKEN_PROXY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  console.log("Upgrading MovinToken contract to V2...");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  try {
    // Get the new implementation contract factory
    const MovinTokenV2 = await ethers.getContractFactory("MovinTokenV2");
    
    console.log("Upgrading MovinToken proxy at:", MOVIN_TOKEN_PROXY_ADDRESS);
    const upgraded = await upgrades.upgradeProxy(MOVIN_TOKEN_PROXY_ADDRESS, MovinTokenV2);
    
    await upgraded.waitForDeployment();
    const upgradedAddress = await upgraded.getAddress();

    console.log("✅ MovinToken proxy upgraded");
    console.log("Proxy address:", upgradedAddress);
    console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(upgradedAddress));
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