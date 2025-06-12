/**
 * Deposit Script for MOVINEarnV2 with Optional Signature Verification
 *
 * This script demonstrates how to interact with MOVINEarnV2 contract functions
 * with both signature-required and signature-optional modes.
 *
 * Required environment variables:
 * - PRIVATE_KEY: The user's private key (who wants to deposit)
 * - OWNER_PRIVATE_KEY: The contract owner's private key (for signing authorization and toggling signature mode)
 *
 * Features:
 * - Toggle signature requirement on/off (owner only)
 * - Test both V1 mode (no signatures) and V2 mode (with signatures)
 * - Comprehensive error handling for both modes
 */

import { ethers } from 'hardhat';
import { MOVIN_EARN_PROXY_ADDRESS, MOVIN_TOKEN_PROXY_ADDRESS } from './contract-addresses';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const SIGNATURE_MODE = process.env.SIGNATURE_MODE === 'true' || false; // Set to true for V2 mode, false for V1 mode
const DEPOSIT_AMOUNT = ethers.parseEther('0.001'); // 1000 MOVIN tokens
const TEST_STEPS = 1;
const TEST_METS = 1;

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
  // EIP-712 Domain for MOVINEarnV2
  const EIP712_DOMAIN = {
    name: 'MOVINEarnV2',
    version: '2',
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
    caller: caller,
    selector: selector,
    nonce: nonce,
    deadline: deadline,
  };

  return await ownerWallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, message);
}

// Function to toggle signature requirement (owner only)
async function toggleSignatureRequirement(
  movinEarnV2: any,
  ownerWallet: any,
  required: boolean
): Promise<void> {
  console.log(`\n🔧 ${required ? 'Enabling' : 'Disabling'} signature requirement...`);

  try {
    const tx = await movinEarnV2.connect(ownerWallet).setSignatureRequired(required);
    await tx.wait();
    console.log(`✅ Signature requirement ${required ? 'enabled' : 'disabled'}`);

    // Verify the change
    const currentSetting = await movinEarnV2.signatureRequired();
    console.log(`📊 Current signature requirement: ${currentSetting}`);
  } catch (error) {
    console.error(`❌ Failed to toggle signature requirement:`, error);
    throw error;
  }
}

// V1 Mode Functions (No Signatures)
async function depositV1(movinEarnV2: any, amount: bigint): Promise<void> {
  console.log(`\n💰 Depositing ${ethers.formatEther(amount)} MOVIN (V1 mode - no signature)...`);

  try {
    // In V1 mode, we still need to provide the signature parameters but they'll be ignored
    const nonce = 0;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const signature = '0x'; // Empty signature

    const tx = await movinEarnV2.deposit(amount, nonce, deadline, signature);
    await tx.wait();
    console.log('✅ V1 Deposit successful');
  } catch (error) {
    console.error('❌ V1 Deposit failed:', error);
    throw error;
  }
}

async function recordActivityV1(
  movinEarnV2: any,
  userAddress: string,
  steps: number,
  mets: number
): Promise<void> {
  console.log(`\n🏃 Recording activity: ${steps} steps, ${mets} mets (V1 mode - no signature)...`);

  try {
    // In V1 mode, we still need to provide the signature parameters but they'll be ignored
    const nonce = 0;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const signature = '0x'; // Empty signature

    const tx = await movinEarnV2.recordActivity(
      userAddress,
      steps,
      mets,
      nonce,
      deadline,
      signature
    );
    await tx.wait();
    console.log('✅ V1 Activity recording successful');
  } catch (error) {
    console.error('❌ V1 Activity recording failed:', error);
    throw error;
  }
}

async function stakeTokensV1(movinEarnV2: any, amount: bigint, lockMonths: number): Promise<void> {
  console.log(
    `\n🔒 Staking ${ethers.formatEther(amount)} MOVIN for ${lockMonths} months (V1 mode - no signature)...`
  );

  try {
    // In V1 mode, we still need to provide the signature parameters but they'll be ignored
    const nonce = 0;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const signature = '0x'; // Empty signature

    const tx = await movinEarnV2.stakeTokens(amount, lockMonths, nonce, deadline, signature);
    await tx.wait();
    console.log('✅ V1 Staking successful');
  } catch (error) {
    console.error('❌ V1 Staking failed:', error);
    throw error;
  }
}

// V2 Mode Functions (With Signatures)
async function depositV2(
  movinEarnV2: any,
  userWallet: any,
  ownerWallet: any,
  amount: bigint,
  chainId: number
): Promise<void> {
  console.log(`\n💰 Depositing ${ethers.formatEther(amount)} MOVIN (V2 mode - with signature)...`);

  try {
    const nonce = await movinEarnV2.getNonce(userWallet.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signature = await generateOwnerSignature(
      ownerWallet,
      userWallet.address,
      'deposit(uint256,uint256,uint256,bytes)',
      Number(nonce),
      deadline,
      chainId
    );

    const tx = await movinEarnV2.deposit(amount, nonce, deadline, signature);
    await tx.wait();
    console.log('✅ V2 Deposit successful');
  } catch (error) {
    console.error('❌ V2 Deposit failed:', error);
    throw error;
  }
}

async function recordActivityV2(
  movinEarnV2: any,
  userWallet: any,
  ownerWallet: any,
  userAddress: string,
  steps: number,
  mets: number,
  chainId: number
): Promise<void> {
  console.log(
    `\n🏃 Recording activity: ${steps} steps, ${mets} mets (V2 mode - with signature)...`
  );

  try {
    const nonce = await movinEarnV2.getNonce(userWallet.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signature = await generateOwnerSignature(
      ownerWallet,
      userWallet.address,
      'recordActivity(address,uint256,uint256,uint256,uint256,bytes)',
      Number(nonce),
      deadline,
      chainId
    );

    const tx = await movinEarnV2.recordActivity(
      userAddress,
      steps,
      mets,
      nonce,
      deadline,
      signature
    );
    await tx.wait();
    console.log('✅ V2 Activity recording successful');
  } catch (error) {
    console.error('❌ V2 Activity recording failed:', error);
    throw error;
  }
}

async function stakeTokensV2(
  movinEarnV2: any,
  userWallet: any,
  ownerWallet: any,
  amount: bigint,
  lockMonths: number,
  chainId: number
): Promise<void> {
  console.log(
    `\n🔒 Staking ${ethers.formatEther(amount)} MOVIN for ${lockMonths} months (V2 mode - with signature)...`
  );

  try {
    const nonce = await movinEarnV2.getNonce(userWallet.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signature = await generateOwnerSignature(
      ownerWallet,
      userWallet.address,
      'stakeTokens(uint256,uint256,uint256,uint256,bytes)',
      Number(nonce),
      deadline,
      chainId
    );

    const tx = await movinEarnV2.stakeTokens(amount, lockMonths, nonce, deadline, signature);
    await tx.wait();
    console.log('✅ V2 Staking successful');
  } catch (error) {
    console.error('❌ V2 Staking failed:', error);
    throw error;
  }
}

// Display contract information
async function displayContractInfo(
  movinEarnV2: any,
  movinToken: any,
  userAddress: string
): Promise<void> {
  console.log('\n📊 Contract Information:');
  console.log('═══════════════════════════════════════');

  // Signature requirement status
  const signatureRequired = await movinEarnV2.signatureRequired();
  console.log(`🔐 Signature Required: ${signatureRequired ? 'YES (V2 Mode)' : 'NO (V1 Mode)'}`);

  // User balances
  const tokenBalance = await movinToken.balanceOf(userAddress);
  console.log(`💰 User Token Balance: ${ethers.formatEther(tokenBalance)} MOVIN`);

  // Contract balance
  const contractBalance = await movinToken.balanceOf(MOVIN_EARN_PROXY_ADDRESS);
  console.log(`🏦 Contract Balance: ${ethers.formatEther(contractBalance)} MOVIN`);

  // User activity
  const userActivity = await movinEarnV2.getTodayUserActivity(userAddress);
  console.log(`🏃 Daily Steps: ${userActivity.dailySteps}`);
  console.log(`⚡ Daily METs: ${userActivity.dailyMets}`);

  // Stakes
  const stakeCount = await movinEarnV2.getUserStakeCount();
  console.log(`🔒 Active Stakes: ${stakeCount}`);

  // Premium status
  const premiumStatus = await movinEarnV2.getPremiumStatus(userAddress);
  console.log(`👑 Premium Status: ${premiumStatus.status}`);

  // Current nonce (for V2 mode)
  const nonce = await movinEarnV2.getNonce(userAddress);
  console.log(`🔢 User Nonce: ${nonce}`);

  console.log('═══════════════════════════════════════\n');
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

  console.log('🚀 MOVINEarnV2 Optional Signature Testing');
  console.log('═══════════════════════════════════════');
  console.log(`👤 User Address: ${userWallet.address}`);
  console.log(`👑 Owner Address: ${ownerWallet.address}`);
  console.log(`🌐 Chain ID: ${chainId}`);
  console.log(
    `🔧 Signature Mode: ${SIGNATURE_MODE ? 'V2 (With Signatures)' : 'V1 (No Signatures)'}`
  );

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

  // Display initial contract info
  await displayContractInfo(movinEarnV2, movinToken, userWallet.address);

  // Set signature requirement based on SIGNATURE_MODE
  await toggleSignatureRequirement(movinEarnV2, ownerWallet, SIGNATURE_MODE);

  // Check if user has enough tokens
  const tokenBalance = await movinToken.balanceOf(userWallet.address);
  if (tokenBalance < DEPOSIT_AMOUNT) {
    console.log(
      `❌ Insufficient token balance. Need ${ethers.formatEther(DEPOSIT_AMOUNT)} MOVIN, have ${ethers.formatEther(tokenBalance)} MOVIN`
    );
    console.log('Please mint or transfer tokens to the user address first.');
    return;
  }

  // Approve tokens for the contract
  console.log(`\n🔓 Approving ${ethers.formatEther(DEPOSIT_AMOUNT)} MOVIN tokens...`);
  const approveTx = await movinToken.approve(MOVIN_EARN_PROXY_ADDRESS, DEPOSIT_AMOUNT);
  await approveTx.wait();
  console.log('✅ Tokens approved');

  try {
    if (SIGNATURE_MODE) {
      // V2 Mode - Test with signatures
      console.log('\n🔐 Testing V2 Mode (With Signatures)');
      console.log('────────────────────────────────────');

      await depositV2(movinEarnV2, userWallet, ownerWallet, DEPOSIT_AMOUNT, chainId);
      await recordActivityV2(
        movinEarnV2,
        userWallet,
        ownerWallet,
        userWallet.address,
        TEST_STEPS,
        TEST_METS,
        chainId
      );

      // Test staking if user has enough tokens left
      const remainingBalance = await movinToken.balanceOf(userWallet.address);
      if (remainingBalance >= DEPOSIT_AMOUNT) {
        // Need to approve more tokens for staking
        const stakeApproveTx = await movinToken.approve(MOVIN_EARN_PROXY_ADDRESS, DEPOSIT_AMOUNT);
        await stakeApproveTx.wait();
        await stakeTokensV2(movinEarnV2, userWallet, ownerWallet, DEPOSIT_AMOUNT, 1, chainId);
      }
    } else {
      // V1 Mode - Test without signatures
      console.log('\n🔓 Testing V1 Mode (No Signatures)');
      console.log('────────────────────────────────────');

      await depositV1(movinEarnV2, DEPOSIT_AMOUNT);
      await recordActivityV1(movinEarnV2, userWallet.address, TEST_STEPS, TEST_METS);

      // Test staking if user has enough tokens left
      const remainingBalance = await movinToken.balanceOf(userWallet.address);
      if (remainingBalance >= DEPOSIT_AMOUNT) {
        // Need to approve more tokens for staking
        const stakeApproveTx = await movinToken.approve(MOVIN_EARN_PROXY_ADDRESS, DEPOSIT_AMOUNT);
        await stakeApproveTx.wait();
        await stakeTokensV1(movinEarnV2, DEPOSIT_AMOUNT, 1);
      }
    }

    // Display final contract info
    await displayContractInfo(movinEarnV2, movinToken, userWallet.address);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);

    // Display final contract info even if tests failed
    await displayContractInfo(movinEarnV2, movinToken, userWallet.address);
  }

  // Demonstration: Toggle between modes
  // console.log('\n🔄 Demonstrating Mode Toggle');
  // console.log('────────────────────────────────────');

  // try {
  //   // Toggle to opposite mode
  //   await toggleSignatureRequirement(movinEarnV2, ownerWallet, !SIGNATURE_MODE);

  //   // Test a simple function in the new mode
  //   if (!SIGNATURE_MODE) {
  //     console.log('Now testing V2 mode with a simple activity recording...');
  //     await recordActivityV2(
  //       movinEarnV2,
  //       userWallet,
  //       ownerWallet,
  //       userWallet.address,
  //       1,
  //       0,
  //       chainId
  //     );
  //   } else {
  //     console.log('Now testing V1 mode with a simple activity recording...');
  //     await recordActivityV1(movinEarnV2, userWallet.address, 1, 0);
  //   }

  //   // Toggle back to original mode
  //   await toggleSignatureRequirement(movinEarnV2, ownerWallet, SIGNATURE_MODE);
  // } catch (error) {
  //   console.error('❌ Mode toggle demonstration failed:', error);
  // }

  console.log('\n🎉 Script completed!');
  console.log('\n📋 To change signature mode, set SIGNATURE_MODE in your .env file:');
  console.log('SIGNATURE_MODE=true   # Enable signature verification (V2 mode)');
  console.log('SIGNATURE_MODE=false  # Disable signature verification (V1 mode)');
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  console.log('\n📋 Make sure your .env file contains:');
  console.log('PRIVATE_KEY=0x... (user wallet private key)');
  console.log('OWNER_PRIVATE_KEY=0x... (contract owner private key)');
  console.log('SIGNATURE_MODE=true/false (optional, defaults to false)');
  process.exitCode = 1;
});
