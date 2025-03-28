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

// Moralis Integration
export const initializeContractsMoralis = async () => {
  const Moralis = require('moralis').default;
  const { EvmChain } = require('@moralisweb3/common-evm-utils');

  // Initialize Moralis if not already initialized
  if (!Moralis.Core.isStarted) {
    await Moralis.start({
      apiKey: process.env.MORALIS_API_KEY,
      // ... other config options
    });
  }

  // Get the Web3Provider from Moralis
  const web3Provider = await Moralis.enableWeb3({
    chainId: 8453, // Base Mainnet
  });

  // Create contract instances using Moralis
  const movinToken = new Moralis.Web3.Contract(
    MOVIN_TOKEN_ABI,
    CONTRACT_ADDRESSES.MOVIN_TOKEN,
    web3Provider
  );

  const movinEarn = new Moralis.Web3.Contract(
    MOVIN_EARN_ABI,
    CONTRACT_ADDRESSES.MOVIN_EARN,
    web3Provider
  );

  // Helper functions for common operations
  const helpers = {
    // Token operations
    async getTokenBalance(address) {
      return await movinToken.methods.balanceOf(address).call();
    },

    async transferTokens(to, amount) {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinToken.methods.transfer(to, amount)
        .send({ from: accounts[0] });
    },

    async approveTokens(spender, amount) {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinToken.methods.approve(spender, amount)
        .send({ from: accounts[0] });
    },

    // Staking operations
    async stakeTokens(amount, lockMonths) {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinEarn.methods.stakeTokens(amount, lockMonths)
        .send({ from: accounts[0] });
    },

    async getUserStakes(address) {
      return await movinEarn.methods.getUserStakes(address).call();
    },

    async claimStakingRewards(stakeIndex) {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinEarn.methods.claimStakingRewards(stakeIndex)
        .send({ from: accounts[0] });
    },

    // Activity operations
    async recordActivity(steps, mets) {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinEarn.methods.recordActivity(steps, mets)
        .send({ from: accounts[0] });
    },

    async claimRewards() {
      const accounts = await web3Provider.eth.getAccounts();
      return await movinEarn.methods.claimRewards()
        .send({ from: accounts[0] });
    },

    // Premium status
    async getPremiumStatus(address) {
      return await movinEarn.methods.getIsPremiumUser(address).call();
    },

    // Get pending rewards
    async getPendingRewards() {
      return await movinEarn.methods.getPendingRewards().call();
    }
  };

  return {
    movinToken,
    movinEarn,
    helpers,
    web3Provider
  };
};

// Example usage with Moralis in a React component:
/*
import { initializeContractsMoralis } from './contracts';

const YourComponent = () => {
  const [contracts, setContracts] = useState(null);

  useEffect(() => {
    const initContracts = async () => {
      const contractInstances = await initializeContractsMoralis();
      setContracts(contractInstances);
    };
    initContracts();
  }, []);

  const handleStake = async () => {
    if (!contracts) return;
    
    try {
      const amount = ethers.utils.parseUnits('1000', 18); // 1000 MVN
      await contracts.helpers.stakeTokens(amount, 1); // Stake for 1 month
    } catch (error) {
      console.error('Error staking:', error);
    }
  };

  // ... rest of your component
};
*/ 