import { ethers } from 'hardhat';
import { MOVIN_EARN_PROXY_ADDRESS, USER_ADDRESS } from './contract-addresses';

async function main() {
  // Load private key from environment variable
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Missing PRIVATE_KEY environment variable');
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  console.log('Using wallet address:', wallet.address);

  // Get contract instance
  const movinEarn = await ethers.getContractAt('MOVINEarnV2', MOVIN_EARN_PROXY_ADDRESS, wallet);

  // Check if the address is the owner
  const contractOwner = await movinEarn.owner();
  if (contractOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('Error: The wallet is not the contract owner');
    return;
  }

  // Set transactionSync to true for the user
  const tx = await movinEarn.setTransactionSync(USER_ADDRESS, true);
  await tx.wait();
  console.log(`TransactionSync set to true for user ${USER_ADDRESS}`);

  // Verify the transactionSync status
  const syncStatus = await movinEarn.transactionSync(USER_ADDRESS);
  console.log(`TransactionSync status for ${USER_ADDRESS}: ${syncStatus}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
