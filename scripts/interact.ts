import { ethers, upgrades } from "hardhat";
import { MOVIN_TOKEN_PROXY_ADDRESS, MOVIN_EARN_PROXY_ADDRESS } from "./contract-addresses";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Constants from MOVINEarn.test.ts
const STEPS_THRESHOLD = 10_000;
const METS_THRESHOLD = 10;
const MAX_DAILY_STEPS = 25_000;
const MAX_DAILY_METS = 50;
const ONE_TOKEN = ethers.parseEther("1");
const ONE_THOUSAND_TOKENS = ethers.parseEther("1000");
const UNSTAKE_BURN_FEES_PERCENT = 1;
const ACTIVITY_REFERRAL_BONUS_PERCENT = 1;
const ONE_DAY = 24 * 60 * 60;
const THIRTY_DAYS = 30 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

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
    const movinToken = await ethers.getContractAt("MovinToken", MOVIN_TOKEN_PROXY_ADDRESS);
    const movinEarn = await ethers.getContractAt("MOVINEarn", MOVIN_EARN_PROXY_ADDRESS);
    console.log("✅ Connected to MovinToken at:", await movinToken.getAddress());
    console.log("✅ Connected to MOVINEarn at:", await movinEarn.getAddress());

    // Check initial token state
    console.log("\n2. Checking initial token state...");
    const initialTotalSupply = await movinToken.totalSupply();
    const ownerBalance = await movinToken.balanceOf(owner.address);
    console.log("Initial total supply:", ethers.formatEther(initialTotalSupply));
    console.log("Owner balance:", ethers.formatEther(ownerBalance));
    
    // Mint tokens to users through MOVINEarn (since it has ownership)
    console.log("\n3. Minting tokens to users...");
    const mintAmount = ethers.parseEther("10000");
    
    try {
      await movinEarn.mintToken(user1.address, mintAmount);
      console.log(`✅ Minted ${ethers.formatEther(mintAmount)} tokens to User1`);
    } catch (error: any) {
      console.log(`❌ Failed to mint tokens to User1: ${error.message}`);
    }
    
    try {
      await movinEarn.mintToken(user2.address, mintAmount);
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
    
    // Test referral registration
    console.log("\n6. Testing referral registration...");
    try {
      await movinEarn.connect(user2).registerReferral(user1.address);
      console.log("✅ User2 registered User1 as referrer");
      
      const [referrer, earnedBonus, referralCount] = await movinEarn.getReferralInfo(user2.address);
      console.log("Referrer address:", referrer);
      console.log("Earned bonus:", ethers.formatEther(earnedBonus));
      console.log("Referral count:", referralCount.toString());
      
      const referrals = await movinEarn.getUserReferrals(user1.address);
      console.log("User1's referrals count:", referrals.length);
      
      if (referrer === user1.address) {
        console.log("✅ Referral registered correctly");
      } else {
        console.log("❌ Referral not registered correctly");
      }
    } catch (error: any) {
      console.log(`❌ Referral registration failed: ${error.message}`);
    }
    
    // Test staking
    console.log("\n7. Testing staking functionality...");
    // Approve MOVINEarn to spend tokens
    const stakeAmount = ethers.parseEther("1000");
    const lockPeriod = 1; // 1 month
    
    try {
      await movinToken.connect(user1).approve(MOVIN_EARN_PROXY_ADDRESS, stakeAmount * BigInt(3));
      console.log(`✅ User1 approved MOVINEarn to spend ${ethers.formatEther(stakeAmount * BigInt(3))} tokens`);
      
      // Create multiple stakes with different lock periods
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 1); // 1 month
      console.log(`✅ User1 staked ${ethers.formatEther(stakeAmount)} tokens for 1 month`);
      
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 3); // 3 months
      console.log(`✅ User1 staked ${ethers.formatEther(stakeAmount)} tokens for 3 months`);
      
      await movinEarn.connect(user1).stakeTokens(stakeAmount, 6); // 6 months
      console.log(`✅ User1 staked ${ethers.formatEther(stakeAmount)} tokens for 6 months`);
      
      // Check user stakes
      const stakeCount = await movinEarn.connect(user1).getUserStakeCount();
      console.log("User1 stake count:", stakeCount.toString());
      
      // Get stake details
      if (stakeCount > 0) {
        for (let i = 0; i < stakeCount; i++) {
          const stake = await movinEarn.connect(user1).getUserStake(i);
          console.log(`Stake ${i}:`);
          console.log("  Amount:", ethers.formatEther(stake.amount));
          console.log("  Lock duration (seconds):", stake.lockDuration.toString());
          console.log("  Lock duration (months):", Number(stake.lockDuration) / (30 * 24 * 60 * 60));
        }
        console.log("✅ Stakes created successfully");
      }
      
      // Test claimAllStakingRewards
      console.log("\nTesting claimAllStakingRewards...");

      // Increase time by 1 hour to allow staking rewards to accumulate
      await time.increase(3600);

      // We would need to advance time to accumulate rewards
      // This is just a placeholder to show the API call
      try {
        await movinEarn.connect(user1).claimAllStakingRewards();
        console.log("✅ Claimed all staking rewards at once");
      } catch (error: any) {
        console.log(`❌ Claiming all staking rewards failed: ${error.message}`);
      }
    } catch (error: any) {
      console.log(`❌ Staking failed: ${error.message}`);
    }
    
    // Test activity recording
    console.log("\n8. Testing activity recording...");
    
    try {
            // Record some steps (respecting hourly limits)
      const steps = 8000;
      const mets = 8;
      
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
        console.log("ℹ️ METs not recorded (expected: user is not premium)");
      }
      
      // Check pending rewards
      const [pendingStepsRewards, pendingMetsRewards] = await movinEarn.connect(user1).getPendingRewards();
      console.log("Pending steps rewards:", ethers.formatEther(pendingStepsRewards));
      console.log("Pending METs rewards:", ethers.formatEther(pendingMetsRewards));
    } catch (error: any) {
      console.log(`❌ Activity recording failed: ${error.message}`);
    }
    
    // Set premium status
    console.log("\n9. Testing premium status...");
    
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
      
      // Advance time by 1 hour to allow new activity recording
      await time.increase(3600);
      
      // Record activity again to test MET recording for premium users
      const steps = 2000;
      const mets = 2;
      
      await movinEarn.connect(user1).recordActivity(steps, mets);
      console.log(`✅ Recorded ${steps} more steps and ${mets} METs for premium User1`);
      
      // Check recorded activity
      const [recordedSteps, recordedMets] = await movinEarn.connect(user1).getUserActivity();
      console.log("Total recorded steps:", recordedSteps.toString());
      console.log("Total recorded METs:", recordedMets.toString());
      
      if (recordedMets.toString() !== "0") {
        console.log("✅ METs recorded correctly for premium user");
      } else {
        console.log("❌ METs not recorded correctly for premium user");
      }
    } catch (error: any) {
      console.log(`❌ Premium status operation failed: ${error.message}`);
    }

    // Test daily reward rate decrease
    console.log("\n10. Testing daily reward rate decrease...");
    try {
      const initialStepsRate = await movinEarn.baseStepsRate();
      const initialMetsRate = await movinEarn.baseMetsRate();
      console.log("Initial steps rate:", ethers.formatEther(initialStepsRate));
      console.log("Initial METs rate:", ethers.formatEther(initialMetsRate));

      // Advance time by one day
      await time.increase(ONE_DAY + 1);
      
      // Advance time by 2 minutes to allow new activity recording
      await time.increase(120);
      
      // Record activity to trigger rate decrease
      await movinEarn.connect(user1).recordActivity(1000, 1);
      
      const newStepsRate = await movinEarn.baseStepsRate();
      const newMetsRate = await movinEarn.baseMetsRate();
      console.log("New steps rate:", ethers.formatEther(newStepsRate));
      console.log("New METs rate:", ethers.formatEther(newMetsRate));
      
      // Verify rates decreased by 0.1%
      const expectedStepsRate = (initialStepsRate * BigInt(999)) / BigInt(1000);
      const expectedMetsRate = (initialMetsRate * BigInt(999)) / BigInt(1000);
      
      if (newStepsRate === expectedStepsRate && newMetsRate === expectedMetsRate) {
        console.log("✅ Daily reward rate decrease working correctly");
      } else {
        console.log("❌ Daily reward rate decrease not working as expected");
      }
    } catch (error: any) {
      console.log(`❌ Daily reward rate decrease test failed: ${error.message}`);
    }

    // Test emergency pause/unpause
    console.log("\n11. Testing emergency pause/unpause functionality...");
    try {
      // Pause contract
      await movinEarn.connect(owner).emergencyPause();
      console.log("✅ Contract paused");
      
      // Try to stake while paused (should fail)
      try {
        await movinEarn.connect(user1).stakeTokens(ethers.parseEther("100"), 1);
        console.log("❌ Staking while paused should have failed");
      } catch (error: any) {
        console.log("✅ Staking correctly failed while paused");
      }
      
      // Unpause contract
      await movinEarn.connect(owner).emergencyUnpause();
      console.log("✅ Contract unpaused");
      
      // Approve tokens before staking
      await movinToken.connect(user1).approve(MOVIN_EARN_PROXY_ADDRESS, ethers.parseEther("100"));
      console.log("✅ Approved tokens for staking");
      
      // Try to stake after unpause (should succeed)
      await movinEarn.connect(user1).stakeTokens(ethers.parseEther("100"), 1);
      console.log("✅ Staking succeeded after unpause");
    } catch (error: any) {
      console.log(`❌ Emergency pause/unpause test failed: ${error.message}`);
    }

    // Test reward expiration
    console.log("\n12. Testing reward expiration...");
    try {
      // Advance time by 1 hour to allow new activity recording
      await time.increase(3600);
      
      // Record activity to accumulate rewards
      await movinEarn.connect(user1).recordActivity(8000, 8);
      console.log("✅ Recorded activity for rewards");
      
      // Advance time beyond expiration (30 days)
      await time.increase(THIRTY_DAYS + 1);
      console.log("✅ Advanced time beyond expiration");
      
      // Try to claim expired rewards
      try {
        await movinEarn.connect(user1).claimRewards();
        console.log("❌ Claiming expired rewards should have failed");
      } catch (error: any) {
        console.log("✅ Correctly failed to claim expired rewards");
      }
    } catch (error: any) {
      console.log(`❌ Reward expiration test failed: ${error.message}`);
    }

    // Get and log all user data
    console.log("\n13. Final User Data Summary:");
    try {
      // Get User1 data
      console.log("\nUser1 Data:");
      console.log("-------------------");
      
      // Get token balance
      const user1FinalBalance = await movinToken.balanceOf(user1.address);
      console.log("Token Balance:", ethers.formatEther(user1FinalBalance));
      
      // Get stakes
      const user1Stakes = await movinEarn.getUserStakes(user1.address);
      console.log("\nStakes:");
      for (let i = 0; i < user1Stakes.length; i++) {
        console.log(`Stake ${i}:`);
        console.log("  Amount:", ethers.formatEther(user1Stakes[i].amount));
        console.log("  Start Time:", new Date(Number(user1Stakes[i].startTime) * 1000).toISOString());
        console.log("  Lock Duration:", user1Stakes[i].lockDuration.toString(), "seconds");
        console.log("  Last Claimed:", new Date(Number(user1Stakes[i].lastClaimed) * 1000).toISOString());
      }
      
      // Get activity data
      const [user1Steps, user1Mets] = await movinEarn.getUserActivity();
      console.log("\nActivity:");
      console.log("  Steps:", user1Steps.toString());
      console.log("  METs:", user1Mets.toString());
      
      // Get pending rewards
      const [user1PendingSteps, user1PendingMets] = await movinEarn.getPendingRewards();
      console.log("\nPending Rewards:");
      console.log("  Steps Rewards:", ethers.formatEther(user1PendingSteps));
      console.log("  METs Rewards:", ethers.formatEther(user1PendingMets));
      
      // Get premium status
      const user1IsPremium = await movinEarn.getIsPremiumUser(user1.address);
      console.log("\nPremium Status:", user1IsPremium);
      
      // Get referral data
      const [user1Referrer, user1EarnedBonus, user1ReferralCount] = await movinEarn.getReferralInfo(user1.address);
      console.log("\nReferral Info:");
      console.log("  Referrer:", user1Referrer);
      console.log("  Earned Bonus:", ethers.formatEther(user1EarnedBonus));
      console.log("  Referral Count:", user1ReferralCount.toString());
      
      const user1Referrals = await movinEarn.getUserReferrals(user1.address);
      console.log("  Referrals List:", user1Referrals.map(addr => addr.slice(0, 6) + "..." + addr.slice(-4)).join(", "));

      // Get User2 data
      console.log("\nUser2 Data:");
      console.log("-------------------");
      
      // Get token balance
      const user2FinalBalance = await movinToken.balanceOf(user2.address);
      console.log("Token Balance:", ethers.formatEther(user2FinalBalance));
      
      // Get stakes
      const user2Stakes = await movinEarn.getUserStakes(user2.address);
      console.log("\nStakes:");
      for (let i = 0; i < user2Stakes.length; i++) {
        console.log(`Stake ${i}:`);
        console.log("  Amount:", ethers.formatEther(user2Stakes[i].amount));
        console.log("  Start Time:", new Date(Number(user2Stakes[i].startTime) * 1000).toISOString());
        console.log("  Lock Duration:", user2Stakes[i].lockDuration.toString(), "seconds");
        console.log("  Last Claimed:", new Date(Number(user2Stakes[i].lastClaimed) * 1000).toISOString());
      }
      
      // Get activity data
      const [user2Steps, user2Mets] = await movinEarn.getUserActivity();
      console.log("\nActivity:");
      console.log("  Steps:", user2Steps.toString());
      console.log("  METs:", user2Mets.toString());
      
      // Get pending rewards
      const [user2PendingSteps, user2PendingMets] = await movinEarn.getPendingRewards();
      console.log("\nPending Rewards:");
      console.log("  Steps Rewards:", ethers.formatEther(user2PendingSteps));
      console.log("  METs Rewards:", ethers.formatEther(user2PendingMets));
      
      // Get premium status
      const user2IsPremium = await movinEarn.getIsPremiumUser(user2.address);
      console.log("\nPremium Status:", user2IsPremium);
      
      // Get referral data
      const [user2Referrer, user2EarnedBonus, user2ReferralCount] = await movinEarn.getReferralInfo(user2.address);
      console.log("\nReferral Info:");
      console.log("  Referrer:", user2Referrer);
      console.log("  Earned Bonus:", ethers.formatEther(user2EarnedBonus));
      console.log("  Referral Count:", user2ReferralCount.toString());
      
      const user2Referrals = await movinEarn.getUserReferrals(user2.address);
      console.log("  Referrals List:", user2Referrals.map(addr => addr.slice(0, 6) + "..." + addr.slice(-4)).join(", "));

      console.log("\n✅ User data summary completed successfully!");
    } catch (error: any) {
      console.log(`❌ Failed to get user data summary: ${error.message}`);
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