import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("Starting deployment process...");

  try {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy MovinToken
    console.log("\n1. Deploying MovinToken...");
    const MovinToken = await ethers.getContractFactory("MovinToken");
    const movinToken = await upgrades.deployProxy(
      MovinToken,
      [deployer.address],
      { kind: "uups", initializer: "initialize" }
    );
    await movinToken.waitForDeployment();
    const movinTokenAddress = await movinToken.getAddress();
    
    console.log("✅ MovinToken deployed to:", movinTokenAddress);
    console.log("Implementation address:", await upgrades.erc1967.getImplementationAddress(movinTokenAddress));

    // Deploy MOVINEarn
    console.log("\n2. Deploying MOVINEarn...");
    const MOVINEarn = await ethers.getContractFactory("MOVINEarn");
    const movinEarn = await upgrades.deployProxy(
      MOVINEarn,
      [movinTokenAddress],
      { kind: "uups", initializer: "initialize" }
    );
    await movinEarn.waitForDeployment();
    const movinEarnAddress = await movinEarn.getAddress();
    
    console.log("✅ MOVINEarn deployed to:", movinEarnAddress);
    console.log("Implementation address:", await upgrades.erc1967.getImplementationAddress(movinEarnAddress));

    // Fund MOVINEarn with some tokens for rewards
    console.log("\n3. Funding MOVINEarn with tokens for rewards...");
    try {
      const fundAmount = ethers.parseEther("10000000"); // 10 million tokens
      await movinToken.mint(movinEarnAddress, fundAmount);
      console.log(`✅ Funded MOVINEarn with ${ethers.formatEther(fundAmount)} tokens`);
    } catch (error: any) {
      console.log(`❌ Failed to fund MOVINEarn: ${error.message}`);
    }

    // Verify deployment details
    console.log("\n=== DEPLOYMENT SUMMARY ===");
    console.log(`✅ MovinToken (Proxy): ${movinTokenAddress}`);
    console.log(`✅ MOVINEarn (Proxy): ${movinEarnAddress}`);
    console.log("\nStore these addresses for later interaction and upgrades!");
  } catch (error: any) {
    console.log(`❌ Deployment failed: ${error.message}`);
    process.exitCode = 1;
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exitCode = 1;
}); 