# Movin Smart Contracts

This project contains the smart contracts for the Movin ecosystem, built with Solidity, Hardhat, and OpenZeppelin. The contracts are designed to be deployed on Ethereum and compatible EVM networks.

## Contracts

### MovinToken (MOVIN)

An upgradable ERC20 token with the following features:
- UUPS proxy pattern for upgradeability
- Pausable functionality for emergency situations
- Owner-controlled minting with max supply cap of 1 trillion tokens
- Burn functionality allowing token destruction to reduce total supply
- Custom validation (zero address checks, amount validation)

### MOVINEarn

A staking and rewards contract that integrates with fitness activity tracking:
- Stake MOVIN tokens with different lock periods (1, 3, 6, 12, 24 months)
- Higher rewards for longer lock periods
- Record daily steps and MET (Metabolic Equivalent of Task) activity
- Premium user features with enhanced rewards
- Automatic rewards halving mechanism (yearly)
- Migration capabilities for contract upgrades
- Emergency pause functionality

## Key Features

### Token Burning

The MOVIN token includes burn functionality:
- `burn(uint256 amount)`: allows users to burn their own tokens
- `burnFrom(address account, uint256 amount)`: allows authorized spenders to burn tokens from other accounts

### Staking and Rewards

- Various lock periods with different multipliers
- Reward calculation based on staking amount, lock period, and time
- 1% burn fee applied to rewards and unstaking

### Activity Tracking

- Daily steps with 10,000 steps threshold for rewards
- MET tracking (premium users) with 10 MET threshold
- Automatic reset at midnight
- Rewards expire after 30 days

### Premium Benefits

- Access to MET-based rewards
- Enhanced earning potential

## Prerequisites

- Node.js (v16+ recommended)
- npm or yarn

## Setup

1. Clone the repository

2. Install dependencies
```
npm install
```

## Compile Contracts

```
npx hardhat compile
```

## Test

Run all tests:
```
npx hardhat test
```

Test specific contracts:
```
npx hardhat test test/MovinToken.test.ts
npx hardhat test test/MOVINEarn.test.ts
```

## Deployment

### Local Deployment

```
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

### Testnet Deployment

```
npx hardhat run scripts/deploy.ts --network <testnet-name>
```

### Mainnet Deployment

```
npx hardhat run scripts/deploy.ts --network <network-name>
```

## Upgrading the Contracts

After deployment, update the proxy address in the upgrade script, then run:

```
npx hardhat run scripts/upgrade.ts --network <network-name>
```

## Development Notes

### Contract Security

- ReentrancyGuard for protection against reentrancy attacks
- Proper access control with Ownable2Step
- Pausable functionality for emergency situations
- Input validation to prevent invalid operations

### Smart Contract Architecture

```
MovinToken
├── ERC20Upgradeable
├── ERC20PausableUpgradeable
├── ERC20BurnableUpgradeable
├── Ownable2StepUpgradeable
└── UUPSUpgradeable

MOVINEarn
├── Ownable2StepUpgradeable
├── ReentrancyGuardUpgradeable
├── PausableUpgradeable
└── UUPSUpgradeable
```

## License

MIT
