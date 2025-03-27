import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("Deploying Movin contracts...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. Deploy MovinToken contract
  console.log("\n=== DEPLOYING MOVIN TOKEN ===");
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

  // 2. Deploy MOVINEarn contract
  console.log("\n=== DEPLOYING MOVIN EARN ===");
  const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
  
  const movinEarn = await upgrades.deployProxy(
    MOVINEarn,
    [movinTokenAddress], // Pass the MovinToken address to the initializer
    {
      kind: "uups",
      initializer: "initialize"
    }
  );

  await movinEarn.waitForDeployment();
  const movinEarnAddress = await movinEarn.getAddress();

  console.log("MOVINEarn deployed to:", movinEarnAddress);
  console.log("Implementation address:", await upgrades.erc1967.getImplementationAddress(movinEarnAddress));
  console.log("Admin address:", await upgrades.erc1967.getAdminAddress(movinEarnAddress));

  // 3. Summary of deployments
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("MovinToken (MOVIN): ", movinTokenAddress);
  console.log("MOVINEarn:          ", movinEarnAddress);
  console.log("\nVerify contracts with:");
  console.log(`npx hardhat verify --network <network-name> ${await upgrades.erc1967.getImplementationAddress(movinTokenAddress)}`);
  console.log(`npx hardhat verify --network <network-name> ${await upgrades.erc1967.getImplementationAddress(movinEarnAddress)}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 