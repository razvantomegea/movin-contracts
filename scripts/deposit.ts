import { ethers } from 'hardhat';
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from './contract-addresses';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Get private key from .env
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Private key not found in .env file');
  }

  // Create provider and wallet
  const provider = ethers.provider;
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log('Using wallet address:', wallet.address);

  // Get contract instances
  const movinEarnV2 = await ethers.getContractAt('MOVINEarnV2', MOVIN_EARN_PROXY_ADDRESS, wallet);
  const movinToken = await ethers.getContractAt('MovinToken', MOVIN_TOKEN_PROXY_ADDRESS, wallet);

  // Amount to deposit (in ether units - will be converted to wei)
  const depositAmount = ethers.parseEther('90000000');

  // Check token balance
  const tokenBalance = await movinToken.balanceOf(wallet.address);
  console.log(`Token balance: ${ethers.formatEther(tokenBalance)} MOVIN`);

  if (tokenBalance < depositAmount) {
    console.log('❌ Insufficient token balance for deposit');
    return;
  }

  // Approve tokens for deposit
  // console.log(`Approving ${ethers.formatEther(depositAmount)} MOVIN tokens for deposit...`);
  // const approveTx = await movinToken.approve(MOVIN_EARN_PROXY_ADDRESS, depositAmount);
  // await approveTx.wait();
  // console.log("✅ Tokens approved");

  // Deposit tokens
  // console.log(`Depositing ${ethers.formatEther(depositAmount)} MOVIN tokens...`);
  // const depositTx = await movinEarnV2.deposit(depositAmount);
  // await depositTx.wait();
  // console.log("✅ Deposit successful");

  const userActivity = await movinEarnV2.userActivities(wallet.address);
  console.log(
    `User activity: ${userActivity.dailySteps} steps, ${userActivity.dailyMets} mets, ${userActivity.lastUpdated} updated, ${userActivity.pendingStepsRewards} steps rewards, ${userActivity.pendingMetsRewards} mets rewards, ${userActivity.lastRewardAccumulationTime} last reward accumulation time, ${userActivity.lastUpdated} last updated`
  );

  const latestBlock = await provider.getBlock('latest');
  const latestBlockTimestamp = Number(latestBlock?.timestamp);
  console.log(`Latest block: ${latestBlockTimestamp}`);
  console.log(`Latest block date: ${new Date(latestBlockTimestamp * 1000).toLocaleString()}`);
  const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
  // Convert nanoseconds to milliseconds and create a Date object
  const rewardHalvingDate = new Date(Number(rewardHalvingTimestamp) * 1000);
  console.log(`Reward halving timestamp (raw): ${rewardHalvingTimestamp}`);
  console.log(`Reward halving date: ${rewardHalvingDate.toLocaleString()}`);

  // Verify deposit by checking contract balance
  const contractBalance = await movinToken.balanceOf(MOVIN_EARN_PROXY_ADDRESS);
  console.log(`Contract token balance: ${ethers.formatEther(contractBalance)} MOVIN`);

  const stakeCount = await movinEarnV2.connect(wallet).getUserStakeCount();
  console.log(`Stake count: ${stakeCount}`);

  const premiumExpirationTimeMonthlyAmount =
    await movinEarnV2.PREMIUM_EXPIRATION_TIME_MONTHLY_AMOUNT();
  console.log(`Premium expiration time monthly amount: ${premiumExpirationTimeMonthlyAmount}`);

  await movinEarnV2.connect(wallet).setPremiumStatus(false, 0);

  const premiumStatus = await movinEarnV2.connect(wallet).getPremiumStatus();
  console.log(`Premium status: ${premiumStatus}`);
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exitCode = 1;
});
