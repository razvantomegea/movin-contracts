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
  deadline: number,
  chainId: number
): Promise<string> {
  // EIP-712 Domain for MOVINEarnV2 - using the ACTUAL domain from the contract
  // The contract has empty name and version due to initialization issues
  const EIP712_DOMAIN = {
    name: '', // Contract has empty name
    version: '', // Contract has empty version
    chainId: chainId,
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

  const selector = getFunctionSelector(functionSignature);

  const message = {
    caller: caller, // This should be the user calling the function (msg.sender), not the owner
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

  // Get chain ID from the network
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log('Using user wallet address:', userWallet.address);
  console.log('Using owner wallet address:', ownerWallet.address);
  console.log('Using chain ID:', chainId);

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
  //     deadline,
  //     chainId
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
    premiumDeadline,
    chainId
  );
  await movinEarnV2.setPremiumStatus(false, 0, premiumNonce, premiumDeadline, premiumSignature);
  */

  const premiumStatus = await movinEarnV2.getPremiumStatus(userWallet.address);
  console.log(`Premium status: ${premiumStatus}`);

  const userActivity = await movinEarnV2.getTodayUserActivity(userWallet.address);
  console.log(`User activity: ${userActivity}`);

  // Test recordActivity with owner signature
  console.log('\n🔄 Testing recordActivity with 1 step...');
  try {
    // Get user's nonce and create deadline
    const activityNonce = await (movinEarnV2 as any).getNonce(userWallet.address);
    const activityDeadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

    console.log(`Activity nonce: ${activityNonce}, Deadline: ${activityDeadline}`);
    console.log(`Current timestamp: ${Math.floor(Date.now() / 1000)}`);
    console.log(
      `Deadline is ${activityDeadline - Math.floor(Date.now() / 1000)} seconds in the future`
    );

    // Debug: Generate function selector manually
    const functionSig = 'recordActivity(address,uint256,uint256,uint256,uint256,bytes)';
    const functionSelector = getFunctionSelector(functionSig);
    console.log(`Function signature: ${functionSig}`);
    console.log(`Function selector: ${functionSelector}`);

    // Generate owner signature for recordActivity
    const activitySignature = await generateOwnerSignature(
      ownerWallet,
      userWallet.address,
      functionSig,
      Number(activityNonce),
      activityDeadline,
      chainId
    );

    console.log(`Generated activity signature: ${activitySignature.slice(0, 10)}...`);
    console.log(`Full signature: ${activitySignature}`);
    console.log(`Signature length: ${activitySignature.length}`);

    // Debug: Print EIP712 domain hash manually
    console.log('EIP712 Domain used for signing:', {
      name: '', // Using actual contract domain (empty)
      version: '', // Using actual contract domain (empty)
      chainId: chainId,
      verifyingContract: MOVIN_EARN_PROXY_ADDRESS,
    });

    // Call recordActivity with signature (1 step, 0 mets)
    console.log('Calling recordActivity with params:', {
      user: userWallet.address,
      newSteps: 1,
      newMets: 0,
      nonce: Number(activityNonce),
      deadline: activityDeadline,
      signatureLength: activitySignature.length,
    });

    const recordTx = await (movinEarnV2 as any).recordActivity(
      userWallet.address,
      1, // 1 step
      0, // 0 mets
      activityNonce,
      activityDeadline,
      activitySignature
    );
    await recordTx.wait();
    console.log('✅ recordActivity successful');
  } catch (error) {
    console.error('❌ recordActivity failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);

      // Try to get more specific error information
      if (error.message.includes('execution reverted')) {
        console.log('\n🔍 This could be due to:');
        console.log('1. InvalidSignature - Owner signature verification failed');
        console.log('2. InvalidNonce - Nonce mismatch');
        console.log('3. SignatureExpired - Deadline passed');
        console.log('4. InvalidActivityInput - Activity validation failed');
        console.log('5. ContractPaused - Contract is paused');
      }
    }

    // Let's also test if the contract is paused
    try {
      const isPaused = await (movinEarnV2 as any).paused();
      console.log(`Contract paused status: ${isPaused}`);

      const owner = await (movinEarnV2 as any).owner();
      console.log(`Contract owner: ${owner}`);
      console.log(`Signer is owner: ${owner.toLowerCase() === ownerWallet.address.toLowerCase()}`);
    } catch (e) {
      console.log('Could not check contract status');
    }
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  console.log('\n📋 Make sure your .env file contains:');
  console.log('PRIVATE_KEY=0x... (user wallet private key)');
  console.log('OWNER_PRIVATE_KEY=0x... (contract owner private key)');
  process.exitCode = 1;
});
