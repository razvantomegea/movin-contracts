import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("Deploying MovinToken contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy the implementation contract behind a proxy
  const MovinToken = await ethers.getContractFactory("MovinToken");
  
  const movinToken = await upgrades.deployProxy(
    MovinToken, 
    [deployer.address], // Parameters for the initialize function
    { 
      kind: "uups",
      initializer: "initialize" 
    }
  );

  await movinToken.waitForDeployment();
  const movinTokenAddress = await movinToken.getAddress();

  console.log("MovinToken deployed to:", movinTokenAddress);
  console.log("Implementation address:", await upgrades.erc1967.getImplementationAddress(movinTokenAddress));
  console.log("Admin address:", await upgrades.erc1967.getAdminAddress(movinTokenAddress));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 