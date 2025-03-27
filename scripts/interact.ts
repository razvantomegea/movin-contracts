import { ethers } from "hardhat";
import { MovinToken, MOVINEarn } from "../typechain-types";

// Contract addresses from deployment
const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MOVIN_EARN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

async function main() {
  console.log("Interacting with Movin contracts...");

  const [owner, user1, user2] = await ethers.getSigners();
  console.log("Using accounts:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);

  // Get contract instances
  const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_ADDRESS) as MovinToken;
  const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_ADDRESS) as MOVINEarn;

  console.log("\n=== MOVIN TOKEN INFORMATION ===");
  const name = await movinToken.name();
  const symbol = await movinToken.symbol();
  const totalSupply = await movinToken.totalSupply();
  const ownerBalance = await movinToken.balanceOf(owner.address);
  const maxSupply = await movinToken.MAX_SUPPLY();
  
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
  console.log(`Owner Balance: ${ethers.formatEther(ownerBalance)} ${symbol}`);
  console.log(`Max Supply: ${ethers.formatEther(maxSupply)} ${symbol}`);

  console.log("\n=== TRANSFERRING TOKENS ===");
  // Transfer tokens to user1
  const transferAmount = ethers.parseEther("1000000");
  console.log(`Transferring ${ethers.formatEther(transferAmount)} ${symbol} to ${user1.address}...`);
  await movinToken.connect(owner).transfer(user1.address, transferAmount);
  console.log(`User1 Balance: ${ethers.formatEther(await movinToken.balanceOf(user1.address))} ${symbol}`);

  console.log("\n=== STAKING TOKENS ===");
  // User1 stakes tokens
  const stakeAmount = ethers.parseEther("100000");
  const lockPeriod = 3; // 3 months
  
  console.log(`Approving ${ethers.formatEther(stakeAmount)} ${symbol} for staking...`);
  await movinToken.connect(user1).approve(MOVIN_EARN_ADDRESS, stakeAmount);
  
  console.log(`Staking ${ethers.formatEther(stakeAmount)} ${symbol} for ${lockPeriod} months...`);
  await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
  
  // Check stake
  const userStakes = await movinEarn.connect(user1).getUserStakes(user1.address);
  console.log(`User1 has ${userStakes.length} active stakes`);
  console.log(`Stake amount: ${ethers.formatEther(userStakes[0].amount)} ${symbol}`);
  console.log(`Stake lock duration: ${Number(userStakes[0].lockDuration) / (30 * 24 * 60 * 60)} months`);

  console.log("\n=== RECORDING ACTIVITY ===");
  // Set user1 as premium
  console.log("Setting User1 as premium...");
  await movinEarn.connect(owner).setPremiumStatus(user1.address, true);
  console.log(`User1 premium status: ${await movinEarn.getIsPremiumUser(user1.address)}`);
  
  // Record activity
  const steps = 12500;
  const mets = 15;
  console.log(`Recording activity: ${steps} steps, ${mets} METs...`);
  await movinEarn.connect(user1).recordActivity(steps, mets);
  
  // Check activity and rewards
  const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
  const [stepsReward, metsReward] = await movinEarn.connect(user1).getPendingRewards();
  
  console.log(`Recorded activity: ${recordedSteps} steps, ${recordedMets} METs`);
  console.log(`Pending rewards: ${ethers.formatEther(stepsReward)} tokens (steps), ${ethers.formatEther(metsReward)} tokens (METs)`);

  console.log("\n=== TESTING BURN FUNCTIONALITY ===");
  // Burn tokens
  const burnAmount = ethers.parseEther("10000");
  console.log(`User1 balance before burn: ${ethers.formatEther(await movinToken.balanceOf(user1.address))} ${symbol}`);
  console.log(`Burning ${ethers.formatEther(burnAmount)} ${symbol}...`);
  await movinToken.connect(user1).burn(burnAmount);
  console.log(`User1 balance after burn: ${ethers.formatEther(await movinToken.balanceOf(user1.address))} ${symbol}`);
  console.log(`New total supply: ${ethers.formatEther(await movinToken.totalSupply())} ${symbol}`);
  
  console.log("\n=== INTERACTION COMPLETE ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 