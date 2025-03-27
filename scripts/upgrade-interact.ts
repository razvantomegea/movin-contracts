import { ethers, upgrades } from "hardhat";
import { MovinToken, MOVINEarn } from "../typechain-types";

// Contract addresses from deployment
const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MOVIN_EARN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

async function main() {
  console.log("Testing contract upgrades...");

  const [owner, user1, user2] = await ethers.getSigners();
  console.log("Using accounts:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);

  // Get current contract instances
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_ADDRESS);
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_ADDRESS);

  // 1. Verify current state and functionality
  console.log("\n=== CURRENT CONTRACT STATE ===");
  console.log("MovinToken Total Supply:", ethers.formatEther(await movinToken.totalSupply()));
  console.log("MovinToken User1 Balance:", ethers.formatEther(await movinToken.balanceOf(user1.address)));
  
  // Check MOVINEarn state
  const userStakesCount = await movinEarn.connect(user1).getUserStakeCount();
  console.log("MOVINEarn User1 Stakes Count:", userStakesCount.toString());
  
  // Check if user1 is premium
  const isPremiumBefore = await movinEarn.getIsPremiumUser(user1.address);
  console.log("User1 Premium Status:", isPremiumBefore);

  // 2. Deploy new implementation for MovinToken
  console.log("\n=== UPGRADING MOVIN TOKEN TO V2 ===");
  const MovinTokenV2 = await ethers.getContractFactory("MovinTokenV2");
  console.log("Deploying new implementation...");
  const upgradedMovinToken = await upgrades.upgradeProxy(MOVIN_TOKEN_ADDRESS, MovinTokenV2);
  await upgradedMovinToken.waitForDeployment();

  console.log("MovinToken upgraded at:", await upgradedMovinToken.getAddress());
  console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(MOVIN_TOKEN_ADDRESS));
  
  // Verify state is preserved
  console.log("\nVerifying state preservation after upgrade:");
  console.log("MovinToken Total Supply:", ethers.formatEther(await upgradedMovinToken.totalSupply()));
  console.log("MovinToken User1 Balance:", ethers.formatEther(await upgradedMovinToken.balanceOf(user1.address)));

  // Test upgraded token functionality - burn more tokens
  const burnAmount = ethers.parseEther("5000");
  console.log(`\nBurning ${ethers.formatEther(burnAmount)} tokens from User1...`);
  await upgradedMovinToken.connect(user1).burn(burnAmount);
  
  console.log("User1 Balance after burn:", ethers.formatEther(await upgradedMovinToken.balanceOf(user1.address)));
  console.log("Total Supply after burn:", ethers.formatEther(await upgradedMovinToken.totalSupply()));

  // Test new V2 token lock functionality
  console.log("\nTesting new V2 token locking functionality:");
  const lockDuration = 60 * 60; // 1 hour lock for testing
  await upgradedMovinToken.connect(user1).lockTokens(lockDuration);
  
  // Check lock status
  const isLocked = await upgradedMovinToken.isLocked(user1.address);
  const unlockTime = await upgradedMovinToken.getUnlockTime(user1.address);
  console.log(`User1 tokens locked: ${isLocked}`);
  console.log(`Unlock time: ${new Date(Number(unlockTime) * 1000).toLocaleString()}`);
  
  // Try to transfer (should fail)
  try {
    await upgradedMovinToken.connect(user1).transfer(user2.address, ethers.parseEther("1000"));
    console.log("Transfer succeeded unexpectedly!");
  } catch (error) {
    console.log("Transfer correctly failed when tokens are locked");
  }

  // 3. Deploy new implementation for MOVINEarn
  console.log("\n=== UPGRADING MOVIN EARN TO V2 ===");
  const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2");
  console.log("Deploying new implementation...");
  const upgradedMovinEarn = await upgrades.upgradeProxy(MOVIN_EARN_ADDRESS, MOVINEarnV2);
  await upgradedMovinEarn.waitForDeployment();

  console.log("MOVINEarn upgraded at:", await upgradedMovinEarn.getAddress());
  console.log("New implementation address:", await upgrades.erc1967.getImplementationAddress(MOVIN_EARN_ADDRESS));

  // Verify state is preserved
  console.log("\nVerifying state preservation after upgrade:");
  const userStakesCountAfter = await upgradedMovinEarn.connect(user1).getUserStakeCount();
  console.log("MOVINEarn User1 Stakes Count:", userStakesCountAfter.toString());
  
  // Check premium status is preserved
  const isPremiumAfter = await upgradedMovinEarn.getIsPremiumUser(user1.address);
  console.log("User1 Premium Status:", isPremiumAfter);

  // Test new V2 referral functionality
  console.log("\nTesting new V2 referral functionality:");
  // Register user2 as being referred by user1
  await upgradedMovinEarn.connect(user2).registerReferral(user1.address);
  
  // Check referral data
  const [referrer, earnedBonus, referralCount] = await upgradedMovinEarn.getReferralInfo(user2.address);
  console.log(`User2 referrer: ${referrer}`);
  console.log(`User1 earned bonus: ${ethers.formatEther(earnedBonus)}`);
  console.log(`User1 referral count: ${referralCount}`);
  
  // Get user1's referrals
  const referrals = await upgradedMovinEarn.getUserReferrals(user1.address);
  console.log(`User1's referrals: ${referrals.join(', ')}`);
  
  // Test early unstaking penalty (if there's a stake)
  if (userStakesCountAfter > 0) {
    console.log("\nTesting early unstake with penalty (new V2 feature):");
    try {
      await upgradedMovinEarn.connect(user1).unstake(0);
      console.log("Successfully unstaked with early withdrawal penalty");
    } catch (error: any) {
      console.log("Early unstake failed:", error.message);
    }
  }

  console.log("\n=== UPGRADE TEST COMPLETE ===");
  console.log("Both contracts were successfully upgraded to V2 with new functionality");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 