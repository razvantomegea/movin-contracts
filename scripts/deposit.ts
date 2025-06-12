/**
 * Deposit Script for MOVINEarnV2
 *
 * This script demonstrates how to interact with MOVINEarnV2 contract functions
 * that require owner signatures for authorization.
 *
 * Required environment variables:
 * - PRIVATE_KEY: The user's private key (who wants to deposit)
 * - OWNER_PRIVATE_KEY: The contract owner's private key (for signing authorization)
 *
 * Note: In production, the owner's private key should be managed securely
 * by a backend service, not included in client-side scripts.
 */

import { ethers } from 'hardhat';
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from './contract-addresses';
import * as dotenv from 'dotenv';

dotenv.config();

// EIP-712 Domain for MOVINEarnV2
const EIP712_DOMAIN = {
  name: 'MOVINEarnV2',
  version: '2',
  chainId: 31337, // Hardhat default, update for other networks
  verifyingContract: MOVIN_EARN_PROXY_ADDRESS,
};

// EIP-712 Types
const EIP712_TYPES = {
  FunctionCall: [
    { name: 'caller', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// Helper function to get function selector
function getFunctionSelector(functionSignature: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(functionSignature)).slice(0, 10);
}

// Helper function to generate owner signature
async function generateOwnerSignature(
  ownerWallet: any,
  caller: string,
  functionSignature: string,
  nonce: number,
  deadline: number
): Promise<string> {
  const selector = getFunctionSelector(functionSignature);

  const message = {
    caller: caller,
    selector: selector,
    nonce: nonce,
    deadline: deadline,
  };

  return await ownerWallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, message);
}

async function main() {
  // Get private keys from .env
  const privateKey = process.env.PRIVATE_KEY;
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('PRIVATE_KEY not found in .env file');
  }
  if (!ownerPrivateKey) {
    throw new Error('OWNER_PRIVATE_KEY not found in .env file');
  }

  // Create provider and wallets
  const provider = ethers.provider;
  const userWallet = new ethers.Wallet(privateKey, provider);
  const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);

  console.log('Using user wallet address:', userWallet.address);
  console.log('Using owner wallet address:', ownerWallet.address);

  // Get contract instances
  const movinEarnV2 = await ethers.getContractAt(
    'MOVINEarnV2',
    MOVIN_EARN_PROXY_ADDRESS,
    userWallet
  );
  const movinToken = await ethers.getContractAt(
    'MovinToken',
    MOVIN_TOKEN_PROXY_ADDRESS,
    userWallet
  );

  // Amount to deposit (in ether units - will be converted to wei)
  const depositAmount = ethers.parseEther('90000000');

  // Check token balance
  const tokenBalance = await movinToken.balanceOf(userWallet.address);
  console.log(`Token balance: ${ethers.formatEther(tokenBalance)} MOVIN`);

  if (tokenBalance < depositAmount) {
    console.log('❌ Insufficient token balance for deposit');
    return;
  }

  // Approve tokens for deposit
  // console.log(`Approving ${ethers.formatEther(depositAmount)} MOVIN tokens for deposit...`);
  // const approveTx = await movinToken.approve(MOVIN_EARN_PROXY_ADDRESS, depositAmount);
  // await approveTx.wait();
  // console.log('✅ Tokens approved');

  // // Deposit tokens with owner signature
  // console.log(`Depositing ${ethers.formatEther(depositAmount)} MOVIN tokens...`);

  // try {
  //   // Get user's nonce and create deadline
  //   const nonce = await movinEarnV2.getNonce(userWallet.address);
  //   const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

  //   console.log(`User nonce: ${nonce}, Deadline: ${deadline}`);

  //   // Generate owner signature for deposit
  //   const depositSignature = await generateOwnerSignature(
  //     ownerWallet,
  //     userWallet.address,
  //     'deposit(uint256,uint256,uint256,bytes)',
  //     Number(nonce),
  //     deadline
  //   );

  //   console.log(`Generated signature: ${depositSignature.slice(0, 10)}...`);

  //   // Call deposit with signature
  //   const depositTx = await movinEarnV2.deposit(depositAmount, nonce, deadline, depositSignature);
  //   await depositTx.wait();
  //   console.log('✅ Deposit successful');
  // } catch (error) {
  //   console.error('❌ Deposit failed:', error);
  //   return;
  // }

  const userActivities = await movinEarnV2.userActivities(userWallet.address);
  console.log(
    `User activity: ${userActivities.dailySteps} steps, ${userActivities.dailyMets} mets, ${userActivities.lastUpdated} updated, ${userActivities.pendingStepsRewards} steps rewards, ${userActivities.pendingMetsRewards} mets rewards, ${userActivities.lastRewardAccumulationTime} last reward accumulation time, ${userActivities.lastUpdated} last updated`
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

  const stakeCount = await movinEarnV2.connect(userWallet).getUserStakeCount();
  console.log(`Stake count: ${stakeCount}`);

  const premiumExpirationTimeMonthlyAmount =
    await movinEarnV2.PREMIUM_EXPIRATION_TIME_MONTHLY_AMOUNT();
  console.log(`Premium expiration time monthly amount: ${premiumExpirationTimeMonthlyAmount}`);

  // Example: Set premium status with owner signature (uncomment to use)
  /*
  console.log('Setting premium status...');
  const premiumNonce = await movinEarnV2.getNonce(userWallet.address);
  const premiumDeadline = Math.floor(Date.now() / 1000) + 86400;
  const premiumSignature = await generateOwnerSignature(
    ownerWallet,
    userWallet.address,
    'setPremiumStatus(bool,uint256,uint256,uint256,bytes)',
    Number(premiumNonce),
    premiumDeadline
  );
  await movinEarnV2.setPremiumStatus(false, 0, premiumNonce, premiumDeadline, premiumSignature);
  */

  const premiumStatus = await movinEarnV2.getPremiumStatus(userWallet.address);
  console.log(`Premium status: ${premiumStatus}`);

  const userActivity = await movinEarnV2.getTodayUserActivity(userWallet.address);
  console.log(`User activity: ${userActivity}`);
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  console.log('\n📋 Make sure your .env file contains:');
  console.log('PRIVATE_KEY=0x... (user wallet private key)');
  console.log('OWNER_PRIVATE_KEY=0x... (contract owner private key)');
  process.exitCode = 1;
});
