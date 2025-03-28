# Movin dApp Integration

This directory contains everything you need to integrate the Movin smart contracts into your dApp.

## Contract Addresses

The following contract addresses are deployed on Base Mainnet:

| Contract | Address (Proxy) | Address (Implementation) |
|----------|----------------|-------------------------|
| MovinToken | 0x3082c5301afD22543866Fe510C0fB351E3CfF561 | 0x2ff57FD358963CE3dc8b9A49734595f316de5cF2 |
| MOVINEarn | 0x865E693ebd875eD997BeEc565CFfBbE687Ee5776 | 0x32614Bc89eBA119Fca60e59Aae457FC1555dA4c9 |

**IMPORTANT**: Always use the proxy addresses for all interactions. The implementation addresses are provided for reference only.

## Integration Files

- `contracts.js`: Contains contract addresses and initialization functions
- `MovinToken.abi.json`: ABI for the MovinToken contract
- `MOVINEarn.abi.json`: ABI for the MOVINEarn contract

## Integration with ethers.js

```javascript
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, MOVIN_TOKEN_ABI, MOVIN_EARN_ABI } from './contracts';

// Initialize with a provider (e.g., from MetaMask)
const provider = new ethers.providers.Web3Provider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = provider.getSigner();

// Create contract instances
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

// Example interactions
const balance = await movinToken.balanceOf(myAddress);
const isPremium = await movinEarn.getIsPremiumUser(myAddress);
```

## Integration with web3.js

```javascript
import Web3 from 'web3';
import { CONTRACT_ADDRESSES, MOVIN_TOKEN_ABI, MOVIN_EARN_ABI } from './contracts';

// Initialize Web3 with a provider (e.g., from MetaMask)
const web3 = new Web3(window.ethereum);
await window.ethereum.request({ method: 'eth_requestAccounts' });
const accounts = await web3.eth.getAccounts();
const myAddress = accounts[0];

// Create contract instances
const movinToken = new web3.eth.Contract(
  MOVIN_TOKEN_ABI,
  CONTRACT_ADDRESSES.MOVIN_TOKEN
);

const movinEarn = new web3.eth.Contract(
  MOVIN_EARN_ABI,
  CONTRACT_ADDRESSES.MOVIN_EARN
);

// Example interactions
const balance = await movinToken.methods.balanceOf(myAddress).call();
const isPremium = await movinEarn.methods.getIsPremiumUser(myAddress).call();
```

## Common Functions

### MovinToken

- `balanceOf(address)`: Get token balance of an address
- `transfer(address, amount)`: Transfer tokens
- `approve(address, amount)`: Approve an address to spend tokens
- `burn(amount)`: Burn tokens from your own account
- `burnFrom(address, amount)`: Burn tokens from an approved address

### MOVINEarn

- `stakeTokens(amount, lockMonths)`: Stake MVN tokens
- `getUserStakeCount()`: Get number of stakes
- `getUserStakes(address)`: Get all stake details
- `claimStakingRewards(stakeIndex)`: Claim rewards from a stake
- `unstake(stakeIndex)`: Unstake tokens after lock period
- `recordActivity(steps, mets)`: Record user's daily activity
- `claimRewards()`: Claim activity rewards
- `getIsPremiumUser(address)`: Check if a user has premium status

## Contract Verification

The contracts are verified on Basescan and can be viewed at:

- [MovinToken on Basescan](https://basescan.org/address/0x3082c5301afD22543866Fe510C0fB351E3CfF561)
- [MOVINEarn on Basescan](https://basescan.org/address/0x865E693ebd875eD997BeEc565CFfBbE687Ee5776) 