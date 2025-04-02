import { ethers, upgrades } from "hardhat";
import { MOVIN_TOKEN_PROXY_ADDRESS } from "./contract-addresses";

async function main() {
  console.log("Testing MovinToken upgrade to MovinTokenV2...");

  const [owner, user1, user2] = await ethers.getSigners();
  console.log("Using accounts:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);

  // Get current contract instance
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_PROXY_ADDRESS);

  // 1. Verify current state and functionality
  console.log("\n=== CURRENT CONTRACT STATE ===");
  console.log("MovinToken Total Supply:", ethers.formatEther(await movinToken.totalSupply()));
  console.log("MovinToken User1 Balance:", ethers.formatEther(await movinToken.balanceOf(user1.address)));
  
  // Ensure user1 has some tokens for testing
  if ((await movinToken.balanceOf(user1.address)) < ethers.parseEther("10000")) {
    console.log("Transferring some tokens to User1 for testing...");
    const transferAmount = ethers.parseEther("10000");
    await movinToken.connect(owner).transfer(user1.address, transferAmount);
    console.log(`✅ Transferred ${ethers.formatEther(transferAmount)} tokens to User1`);
  } else {
    console.log("✅ User1 already has sufficient tokens for testing");
  }

  // 2. Deploy new implementation for MovinToken
  console.log("\n=== UPGRADING MOVIN TOKEN TO V2 ===");
  try {
    const MovinTokenV2 = await ethers.getContractFactory("MovinTokenV2");
    console.log("Deploying new implementation...");
    const upgradedMovinToken = await upgrades.upgradeProxy(MOVIN_TOKEN_PROXY_ADDRESS, MovinTokenV2);
    await upgradedMovinToken.waitForDeployment();

    console.log("✅ MovinToken upgraded at:", await upgradedMovinToken.getAddress());
    console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(MOVIN_TOKEN_PROXY_ADDRESS));
    
    // Verify state is preserved
    console.log("\nVerifying state preservation after upgrade:");
    const totalSupplyAfter = await upgradedMovinToken.totalSupply();
    const user1BalanceAfter = await upgradedMovinToken.balanceOf(user1.address);
    console.log("MovinToken Total Supply:", ethers.formatEther(totalSupplyAfter));
    console.log("MovinToken User1 Balance:", ethers.formatEther(user1BalanceAfter));
    
    // Test upgraded token functionality - burn some tokens
    console.log(`\nTesting burn functionality:`);
    const burnAmount = ethers.parseEther("5000");
    console.log(`Burning ${ethers.formatEther(burnAmount)} tokens from User1...`);
    await upgradedMovinToken.connect(user1).burn(burnAmount);
    
    const user1BalanceAfterBurn = await upgradedMovinToken.balanceOf(user1.address);
    const totalSupplyAfterBurn = await upgradedMovinToken.totalSupply();
    console.log("User1 Balance after burn:", ethers.formatEther(user1BalanceAfterBurn));
    console.log("Total Supply after burn:", ethers.formatEther(totalSupplyAfterBurn));
    
    if (user1BalanceAfter - user1BalanceAfterBurn === burnAmount) {
      console.log("✅ Burn functionality working correctly");
    } else {
      console.log("❌ Burn functionality not working as expected");
    }

    // Test new V2 token lock functionality
    console.log("\nTesting new V2 token locking functionality:");
    const lockDuration = 60 * 60; // 1 hour lock for testing
    await upgradedMovinToken.connect(user1).lockTokens(lockDuration);
    
    // Check lock status
    const isLocked = await upgradedMovinToken.isLocked(user1.address);
    const unlockTime = await upgradedMovinToken.getUnlockTime(user1.address);
    console.log(`User1 tokens locked: ${isLocked}`);
    console.log(`Unlock time: ${new Date(Number(unlockTime) * 1000).toLocaleString()}`);
    
    if (isLocked) {
      console.log("✅ Token locking successful");
    } else {
      console.log("❌ Token locking failed");
    }
    
    // Try to transfer (should fail)
    console.log("\nTesting transfer restriction when tokens are locked:");
    try {
      await upgradedMovinToken.connect(user1).transfer(user2.address, ethers.parseEther("1000"));
      console.log("❌ Transfer succeeded unexpectedly!");
    } catch (error: any) {
      console.log("✅ Transfer correctly failed when tokens are locked");
      console.log("Error:", error.message);
    }

    // Wait for the lock period to end and unlock tokens
    console.log("\nTesting token unlocking after lock period expires:");
    try {
      // This would only work in a local test environment where we can manipulate time
      // For real networks, you would need to wait for the actual time to pass
      await upgradedMovinToken.connect(user1).unlockTokens();
      console.log("✅ Tokens unlocked successfully");
    } catch (error: any) {
      console.log("❌ Unlock failed, lock period still active");
      console.log("Error:", error.message);
    }

    console.log("\n=== UPGRADE TEST COMPLETE ===");
    console.log("✅ MovinToken was successfully upgraded to V2 with new functionality");
  } catch (error: any) {
    console.log("❌ Upgrade process failed");
    console.log("Error:", error.message);
  }
}

main().catch((error) => {
  console.error("❌ Test failed with error:", error);
  process.exitCode = 1;
}); 