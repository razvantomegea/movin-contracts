import { ethers } from "hardhat";
import { MovinToken, MOVINEarn } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Contract addresses from deployment
const MOVIN_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MOVIN_EARN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

async function main() {
  console.log("Testing contracts on the local network...");

  const [owner, user1, user2] = await ethers.getSigners();
  console.log("Using accounts:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);

  try {
    // Connect to deployed contracts
    console.log("\n1. Connecting to deployed contracts...");
    const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_ADDRESS);
    const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_ADDRESS);
    console.log("✅ Connected to MovinToken at:", await movinToken.getAddress());
    console.log("✅ Connected to MOVINEarn at:", await movinEarn.getAddress());

    // Check initial token state
    console.log("\n2. Checking initial token state...");
    const initialTotalSupply = await movinToken.totalSupply();
    const ownerBalance = await movinToken.balanceOf(owner.address);
    console.log("Initial total supply:", ethers.formatEther(initialTotalSupply));
    console.log("Owner balance:", ethers.formatEther(ownerBalance));
    
    // Mint tokens to users
    console.log("\n3. Minting tokens to users...");
    const mintAmount = ethers.parseEther("10000");
    
    try {
      await movinToken.mint(user1.address, mintAmount);
      console.log(`✅ Minted ${ethers.formatEther(mintAmount)} tokens to User1`);
    } catch (error: any) {
      console.log(`❌ Failed to mint tokens to User1: ${error.message}`);
    }
    
    try {
      await movinToken.mint(user2.address, mintAmount);
      console.log(`✅ Minted ${ethers.formatEther(mintAmount)} tokens to User2`);
    } catch (error: any) {
      console.log(`❌ Failed to mint tokens to User2: ${error.message}`);
    }
    
    // Verify balances after minting
    const user1Balance = await movinToken.balanceOf(user1.address);
    const user2Balance = await movinToken.balanceOf(user2.address);
    console.log("User1 balance after mint:", ethers.formatEther(user1Balance));
    console.log("User2 balance after mint:", ethers.formatEther(user2Balance));
    
    // Test token transfers
    console.log("\n4. Testing token transfers...");
    const transferAmount = ethers.parseEther("500");
    
    try {
      await movinToken.connect(user1).transfer(user2.address, transferAmount);
      console.log(`✅ User1 transferred ${ethers.formatEther(transferAmount)} tokens to User2`);
    } catch (error: any) {
      console.log(`❌ Transfer failed: ${error.message}`);
    }
    
    // Verify balances after transfer
    const user1BalanceAfterTransfer = await movinToken.balanceOf(user1.address);
    const user2BalanceAfterTransfer = await movinToken.balanceOf(user2.address);
    console.log("User1 balance after transfer:", ethers.formatEther(user1BalanceAfterTransfer));
    console.log("User2 balance after transfer:", ethers.formatEther(user2BalanceAfterTransfer));
    
    if (user1BalanceAfterTransfer === user1Balance - transferAmount &&
        user2BalanceAfterTransfer === user2Balance + transferAmount) {
      console.log("✅ Transfer completed successfully");
    } else {
      console.log("❌ Transfer amounts don't match expected values");
    }
    
    // Test token approvals and transferFrom
    console.log("\n5. Testing token approvals and transferFrom...");
    const approvalAmount = ethers.parseEther("1000");
    
    try {
      await movinToken.connect(user2).approve(user1.address, approvalAmount);
      console.log(`✅ User2 approved User1 to spend ${ethers.formatEther(approvalAmount)} tokens`);
      
      const allowance = await movinToken.allowance(user2.address, user1.address);
      console.log("Allowance:", ethers.formatEther(allowance));
      
      // Use transferFrom
      const transferFromAmount = ethers.parseEther("300");
      await movinToken.connect(user1).transferFrom(user2.address, user1.address, transferFromAmount);
      console.log(`✅ User1 transferred ${ethers.formatEther(transferFromAmount)} tokens from User2 using transferFrom`);
    } catch (error: any) {
      console.log(`❌ Approval or transferFrom failed: ${error.message}`);
    }
    
    // Test staking
    console.log("\n6. Testing staking functionality...");
    // Approve MOVINEarn to spend tokens
    const stakeAmount = ethers.parseEther("1000");
    const lockPeriod = 1; // 1 month
    
    try {
      await movinToken.connect(user1).approve(MOVIN_EARN_ADDRESS, stakeAmount);
      console.log(`✅ User1 approved MOVINEarn to spend ${ethers.formatEther(stakeAmount)} tokens`);
      
      // Stake tokens
      await movinEarn.connect(user1).stakeTokens(stakeAmount, lockPeriod);
      console.log(`✅ User1 staked ${ethers.formatEther(stakeAmount)} tokens for ${lockPeriod} month(s)`);
      
      // Check user stakes
      const stakeCount = await movinEarn.connect(user1).getUserStakeCount();
      console.log("User1 stake count:", stakeCount.toString());
      
      // Get stake details
      if (stakeCount > 0) {
        const stake = await movinEarn.connect(user1).getUserStake(0);
        console.log("Stake amount:", ethers.formatEther(stake.amount));
        console.log("Lock duration (seconds):", stake.lockDuration.toString());
        console.log("✅ Stake created successfully");
      }
    } catch (error: any) {
      console.log(`❌ Staking failed: ${error.message}`);
    }
    
    // Test activity recording
    console.log("\n7. Testing activity recording...");
    
    try {
      // Record some steps
      const steps = 15000;
      const mets = 20;
      
      await movinEarn.connect(user1).recordActivity(steps, mets);
      console.log(`✅ Recorded ${steps} steps and ${mets} METs for User1`);
      
      // Check recorded activity
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      console.log("Recorded steps:", recordedSteps.toString());
      console.log("Recorded METs:", recordedMets.toString());
      
      if (recordedSteps.toString() === steps.toString()) {
        console.log("✅ Steps recorded correctly");
      } else {
        console.log("❌ Steps not recorded correctly");
      }
      
      // Non-premium users don't record METs
      if (recordedMets.toString() === "0") {
        console.log("❌ METs not recorded (user is not premium)");
      }
    } catch (error: any) {
      console.log(`❌ Activity recording failed: ${error.message}`);
    }
    
    // Set premium status
    console.log("\n8. Testing premium status...");
    
    try {
      await movinEarn.connect(owner).setPremiumStatus(user1.address, true);
      console.log("✅ Set User1 as premium");
      
      const isPremium = await movinEarn.getIsPremiumUser(user1.address);
      console.log("User1 is premium:", isPremium);
      
      if (isPremium) {
        console.log("✅ Premium status set correctly");
      } else {
        console.log("❌ Premium status not set correctly");
      }
      
      // Record activity again to test MET recording for premium users
      const steps = 5000;
      const mets = 15;
      
      await movinEarn.connect(user1).recordActivity(steps, mets);
      console.log(`✅ Recorded ${steps} more steps and ${mets} METs for premium User1`);
      
      // Check recorded activity
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      console.log("Total recorded steps:", recordedSteps.toString());
      console.log("Total recorded METs:", recordedMets.toString());
      
      if (recordedMets.toString() === mets.toString()) {
        console.log("✅ METs recorded correctly for premium user");
      } else {
        console.log("❌ METs not recorded correctly for premium user");
      }
    } catch (error: any) {
      console.log(`❌ Premium status operation failed: ${error.message}`);
    }
    
    console.log("\n✅ Contract interaction tests completed successfully!");
  } catch (error: any) {
    console.log("\n❌ Tests failed with error:", error.message);
  }
}

main().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exitCode = 1;
}); 