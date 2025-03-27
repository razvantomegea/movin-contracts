import { ethers, upgrades } from "hardhat";

// Update this to the proxy address after deploying
const PROXY_ADDRESS = "YOUR_PROXY_ADDRESS_HERE";

async function main() {
  console.log("Upgrading MovinToken contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  // For a real upgrade, you would typically create a new version of the contract (MovinTokenV2)
  // For this example, we'll just use the same contract
  const MovinToken = await ethers.getContractFactory("MovinToken");
  
  console.log("Upgrading proxy at:", PROXY_ADDRESS);
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, MovinToken);
  
  await upgraded.waitForDeployment();
  const upgradedAddress = await upgraded.getAddress();

  console.log("Proxy upgraded");
  console.log("Proxy address:", upgradedAddress);
  console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(upgradedAddress));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 