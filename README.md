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

### MOVINEarnV2

An upgraded version of the MOVINEarn contract with the following enhancements:
- Referral system for activity points (1% bonus to referrer)
- Daily reward rate decrease of 1% (replaces yearly 50% halving)
- Strict enforcement of lock periods for staking
- Owner-only premium status control

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

### Referral System (V2)

- Users can register a referrer
- Referrers receive 1% of referee's activity points
- Activity bonuses are added to referrer's daily activity

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

## Testing on a Local Hardhat Node

### Step 1: Start a Local Hardhat Node

Open a terminal and run:
```bash
npx hardhat node
```

This starts a local Ethereum node with 20 pre-funded accounts. Keep this terminal running throughout your testing.

### Step 2: Deploy the Initial Contracts

In a new terminal, deploy the initial contracts to your local node:
```bash
npx hardhat run scripts/deploy.ts --network localhost
```

This will deploy MovinToken and MOVINEarn contracts. Note the addresses that are displayed in the console output, as you'll need them for later steps.

### Step 3: Run Automated Tests

To run all tests:
```bash
npx hardhat test --network localhost
```

To run specific test files:
```bash
# Test the token contract
npx hardhat test test/MovinToken.test.ts --network localhost

# Test the original earn contract
npx hardhat test test/MOVINEarn.test.ts --network localhost

# Test the upgraded V2 earn contract
npx hardhat test test/MOVINEarnV2.test.ts --network localhost
```

### Step 4: Interact with the Contracts

Use the interaction script to test basic functionality:
```bash
npx hardhat run scripts/interact.ts --network localhost
```

This script will:
- Mint tokens to test accounts
- Test basic token operations (transfer, approve, etc.)
- Create stakes with different lock periods
- Record activity and check rewards
- Set premium status

### Step 5: Upgrade Contracts

The project includes separate upgrade scripts for each contract:

#### Upgrading the Token Contract

1. If needed, update the proxy address in `scripts/upgrade.ts`:
```typescript
// Update this with your local deployment address if different
const MOVIN_TOKEN_PROXY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
```

2. Run the token upgrade script:
```bash
npx hardhat run scripts/upgrade.ts --network localhost
```

#### Upgrading the Earn Contract

1. If needed, update the proxy address in `scripts/upgrade-earn.ts`:
```typescript
// Update this with your local deployment address if different
const MOVIN_EARN_PROXY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
```

2. Run the earn contract upgrade script:
```bash
npx hardhat run scripts/upgrade-earn.ts --network localhost
```

### Step 6: Test Upgraded Contract Features

There are separate scripts to test each upgraded contract:

#### Testing the Upgraded Token Contract

```bash
npx hardhat run scripts/upgrade-interact.ts --network localhost
```

This script will:
- Verify that state was preserved after the upgrade
- Test the new token burning functionality
- Test new V2 token features (token locking and unlocking)
- Verify that locked tokens cannot be transferred

#### Testing the Upgraded Earn Contract

```bash
npx hardhat run scripts/upgrade-interact-earn.ts --network localhost
```

This script will:
- Verify that state was preserved after the upgrade
- Test the referral system and functionality
- Test premium status control (owner only)
- Test activity referral bonuses (1% bonus to referrers)
- Test daily reward rate decrease (1% daily instead of 50% yearly)
- Verify lock period enforcement for unstaking

### Step 7: Manual Interaction with Hardhat Console

For interactive testing, use the Hardhat console:
```bash
npx hardhat console --network localhost
```

In the console, you can interact with your contracts:
```javascript
// Get contract instances
const MovinTokenV2 = await ethers.getContractFactory("MovinTokenV2")
const MOVINEarnV2 = await ethers.getContractFactory("MOVINEarnV2")

// Attach to deployed contracts (default local addresses, update if different)
const token = await MovinTokenV2.attach("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512")
const earnV2 = await MOVINEarnV2.attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9")

// Get accounts
const [owner, user1, user2] = await ethers.getSigners()

// Test token operations
await token.mint(user1.address, ethers.parseEther("1000"))
await token.balanceOf(user1.address)

// Test premium status (owner only)
await earnV2.connect(owner).setPremiumStatus(user1.address, true)
await earnV2.getIsPremiumUser(user1.address) // Should return true

// Test referral system
await earnV2.connect(user2).registerReferral(user1.address)
await earnV2.getUserReferrals(user1.address) // Should include user2

// Test time-dependent features
const { time } = require("@nomicfoundation/hardhat-network-helpers")
await time.increase(86400) // Advance 1 day
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

After deployment to a testnet or mainnet, use the separate upgrade scripts:

For the token contract:
```
npx hardhat run scripts/upgrade.ts --network <network-name>
```

For the earn contract:
```
npx hardhat run scripts/upgrade-earn.ts --network <network-name>
```

Make sure to update the proxy addresses in each script first with the addresses from your deployment.

## Development Notes

### Contract Security

- ReentrancyGuard for protection against reentrancy attacks
- Proper access control with Ownable2Step
- Pausable functionality for emergency situations
- Input validation to prevent invalid operations

### Smart Contract Architecture

```
MovinToken / MovinTokenV2
├── ERC20Upgradeable
├── ERC20PausableUpgradeable
├── ERC20BurnableUpgradeable
├── Ownable2StepUpgradeable
└── UUPSUpgradeable

MOVINEarn / MOVINEarnV2
├── Ownable2StepUpgradeable
├── ReentrancyGuardUpgradeable
├── PausableUpgradeable
└── UUPSUpgradeable
```

## License

MIT
