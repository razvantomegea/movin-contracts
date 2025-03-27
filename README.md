# Movin Smart Contract

This project contains an upgradable and pausable ERC20 token smart contract built with Solidity, Hardhat, and OpenZeppelin. It's designed to work with Ethereum and Base Chain networks.

## Features

- ERC20 token implementation
- Upgradable using UUPS proxy pattern
- Pausable functionality
- Owner-controlled minting

## Prerequisites

- Node.js (v14+ recommended)
- npm or yarn

## Setup

1. Clone the repository

2. Install dependencies
```
npm install
```

3. Configure environment variables
Copy the `.env.example` file to `.env` and fill in the required values:
```
cp .env.example .env
```
Then edit the `.env` file with your private key and API keys.

## Compile Contracts

```
npx hardhat compile
```

## Test

```
npx hardhat test
```

## Deployment

### Local Deployment

```
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

### Testnet Deployment

Deploy to Base Goerli testnet:
```
npx hardhat run scripts/deploy.ts --network baseGoerli
```

Deploy to Ethereum Sepolia testnet:
```
npx hardhat run scripts/deploy.ts --network sepolia
```

### Mainnet Deployment

Deploy to Base mainnet:
```
npx hardhat run scripts/deploy.ts --network base
```

Deploy to Ethereum mainnet:
```
npx hardhat run scripts/deploy.ts --network mainnet
```

## Upgrading the Contract

After deployment, you'll get a proxy address. Update the `PROXY_ADDRESS` in the `scripts/upgrade.ts` file with your deployed proxy address, then run:

```
npx hardhat run scripts/upgrade.ts --network <network-name>
```

## License

MIT
