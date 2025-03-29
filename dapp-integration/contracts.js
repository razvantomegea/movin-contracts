// Movin Smart Contract Integration
// Base Mainnet Deployment

// Contract Addresses - Always use the proxy addresses for interactions
export const CONTRACT_ADDRESSES = {
  // Proxy addresses (use these for all interactions)
  MOVIN_TOKEN: '0x3082c5301afD22543866Fe510C0fB351E3CfF561',
  MOVIN_EARN: '0x865E693ebd875eD997BeEc565CFfBbE687Ee5776',
  
  // Implementation addresses (for reference only)
  MOVIN_TOKEN_IMPLEMENTATION: '0x2ff57FD358963CE3dc8b9A49734595f316de5cF2',
  MOVIN_EARN_IMPLEMENTATION: '0x32614Bc89eBA119Fca60e59Aae457FC1555dA4c9'
};

// Import ABIs
import MOVIN_TOKEN_ABI from './MovinToken.abi.json';
import MOVIN_EARN_ABI from './MOVINEarn.abi.json';

export { MOVIN_TOKEN_ABI, MOVIN_EARN_ABI };

// Example initialization with ethers.js
export const initializeContracts = (provider) => {
  const { ethers } = require('ethers');
  
  const signer = provider.getSigner();
  
  const movinToken = new ethers.Contract(
    CONTRACT_ADDRESSES.MOVIN_TOKEN,
    MOVIN_TOKEN_ABI,
    signer
  );
  
  const movinEarn = new ethers.Contract(
    CONTRACT_ADDRESSES.MOVIN_EARN,
    MOVIN_EARN_ABI,
    signer
  );
  
  return {
    movinToken,
    movinEarn
  };
};

// Example initialization with web3.js
export const initializeContractsWeb3 = (web3) => {
  const movinToken = new web3.eth.Contract(
    MOVIN_TOKEN_ABI,
    CONTRACT_ADDRESSES.MOVIN_TOKEN
  );
  
  const movinEarn = new web3.eth.Contract(
    MOVIN_EARN_ABI,
    CONTRACT_ADDRESSES.MOVIN_EARN
  );
  
  return {
    movinToken,
    movinEarn
  };
};