# Movin Smart Contracts

This project contains the smart contracts for the Movin ecosystem, built with Solidity, Hardhat, and OpenZeppelin. The contracts are designed to be deployed on Ethereum and compatible EVM networks.

## Contracts

### MovinToken (MOVIN) / MovinTokenV2

An upgradable ERC20 token with the following features:

- UUPS proxy pattern for upgradeability
- Pausable functionality for emergency situations
- Owner-controlled minting with max supply cap of 1 trillion tokens
- Burn functionality allowing token destruction to reduce total supply
- Custom validation (zero address checks, amount validation)
- V2: Token locking mechanism (`lockTokens`, `unlockTokens`)

### MOVINEarn / MOVINEarnV2

A staking and rewards contract that integrates with fitness activity tracking:

- Stake MOVIN tokens with different lock periods (1, 3, 6, 12, 24 months)
- Higher rewards for longer lock periods
- Record daily steps and MET (Metabolic Equivalent of Task) activity
- Premium user features with enhanced rewards
- Automatic rewards rate decrease (V1: yearly halving, V2: 0.1% daily decrease)
- Migration capabilities for contract upgrades
- Emergency pause functionality
- V2: Strict enforcement of lock periods for staking
- V2: Owner-only premium status control

## Key Features

### Token Burning

The MOVIN token includes burn functionality:

- `burn(uint256 amount)`: allows users to burn their own tokens
- `burnFrom(address account, uint256 amount)`: allows authorized spenders to burn tokens from other accounts

### Staking and Rewards

- Various lock periods with different multipliers (24-month requires premium)
- Reward calculation based on staking amount, lock period, and time
- **No burn fee** applied when claiming staking or activity rewards
- 1% burn fee applied only when unstaking tokens (`UNSTAKE_BURN_FEES_PERCENT`)

### Activity Tracking

- Daily steps with 10,000 steps threshold for rewards (Max daily: 30,000)
- MET tracking (premium users) with 10 MET threshold (Max daily: 500)
- Automatic reset at midnight
- Per-minute limits enforced: 300 steps/min, 5 METs/min
- Rewards (staking and activity) expire if not claimed within 1 day

### Premium Benefits

- Access to MET-based rewards
- Enhanced earning potential
- Ability to stake for the 24-month lock period

### Referral System (V2)

- Users can register a referrer
- Referrers receive 1% of referee's claimed activity rewards
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

### Step 4: Interact with the V2 Contracts

Use the V2 interaction script to test functionality:

```bash
npx hardhat run scripts/interactV2.ts --network localhost
```

This script will:

- Mint tokens to test accounts
- Test basic token operations (transfer, approve, burn)
- Test V2 token locking/unlocking
- Create stakes with different lock periods (including premium-only 24m)
- Register referrals
- Record activity and check rewards (including METs for premium, referral bonus)
- Test claiming staking and activity rewards (including expiration)
- Test daily rate decrease
- Set premium status
- Test emergency pause/unpause

### Step 5: Upgrade Contracts (If applicable)

#### Testing the Upgraded Token Contract (V2 features are included in initial deployment)

Consider using `scripts/interactV2.ts` which includes tests for V2 features like locking. The older `upgrade-interact.ts` might be outdated.

#### Testing the Upgraded Earn Contract (V2)

Use the dedicated V2 interaction script:

```bash
npx hardhat run scripts/interactV2.ts --network localhost
```

This script covers:

- State preservation checks (if run after an upgrade)
- Referral system and functionality
- Premium status control (owner only)
- Activity referral bonuses (1% bonus to referrers)
- Daily reward rate decrease (0.1% daily)
- Lock period enforcement for unstaking
- Reward expiration (1 day)
- Activity limits (per-minute, daily)

### Step 7: Manual Interaction with Hardhat Console

For interactive testing, use the Hardhat console:

```bash
npx hardhat console --network localhost
```

In the console, you can interact with your contracts:

```javascript
// Get contract instances
const MovinTokenV2 = await ethers.getContractFactory('MovinTokenV2');
const MOVINEarnV2 = await ethers.getContractFactory('MOVINEarnV2');

// Attach to deployed contracts (Update with your V2 deployment addresses)
const token = await MovinTokenV2.attach('YOUR_MOVIN_TOKEN_V2_PROXY_ADDRESS');
const earnV2 = await MOVINEarnV2.attach('YOUR_MOVIN_EARN_V2_PROXY_ADDRESS');

// Get accounts
const [owner, user1, user2] = await ethers.getSigners();

// Test token operations
await token.mint(user1.address, ethers.parseEther('1000'));
await token.balanceOf(user1.address);

// Test premium status (owner only)
await earnV2.connect(owner).setPremiumStatus(user1.address, true);
await earnV2.getIsPremiumUser(user1.address); // Should return true

// Test referral system
await earnV2.connect(user2).registerReferral(user1.address);
await earnV2.getUserReferrals(user1.address); // Should include user2

// Test activity recording (respect limits)
await time.increase(60); // Ensure enough time passed
await earnV2.connect(user1).recordActivity(10000, 10); // Record steps and METs
await earnV2.connect(user1).getPendingRewards();

// Test reward claiming
await earnV2.connect(user1).claimRewards();

// Test V2 token locking
await token.connect(user1).lockTokens(3600); // Lock for 1 hour
await token.isLocked(user1.address); // Should return true
// await token.connect(user1).transfer(user2.address, 1); // Should fail (TokensAreLocked)
await time.increase(3601); // Advance past lock time
await token.connect(user1).unlockTokens(); // Should succeed
await token.isLocked(user1.address); // Should return false
await token.connect(user1).transfer(user2.address, 1); // Should succeed now

// Test time-dependent features (rate decrease, reward expiration)
const { time } = require('@nomicfoundation/hardhat-network-helpers');
await time.increase(86400); // Advance 1 day
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

### Migration Notes

When upgrading from a previous version (e.g., V1) to MOVINEarnV2:

- The contract preserves essential state like `rewardHalvingTimestamp` during migration to maintain the reward decrease schedule (0.1% daily).
- `baseStepsRate` and `baseMetsRate` are preserved or initialized correctly.
- Activity data fields like `lastUpdated` are initialized or migrated to ensure correct time-based calculations and daily resets.
- Stake data (`lastClaimed`) and referral data (`referralCount`) are validated and potentially fixed during migration.
- Use `scripts/migrateUserData.ts` or `scripts/bulkMigrateUserData.ts` (if available) for data migration.

### Testing the Contract

- `scripts/interactV2.ts` - For comprehensive testing of V2 contract interactions.
- Test suites (`test/MOVINEarnV2.test.ts`, `test/MovinTokenV2.test.ts` if exists) - For automated unit/integration tests.
- `scripts/check-migration.ts` - For checking the migration status (if applicable).
- `scripts/test-activity-record.ts` - For focused testing of activity recording features.

When recording activity, be mindful of the time-based limits:

- The V2 contract enforces per-minute limits (300 steps/min, 5 METs/min)
- Daily limits are also enforced (30,000 steps/day, 500 METs/day)
- Staking and Activity rewards expire if not claimed within 1 day.

## Development Guidelines

1. When fixing linter errors, prioritize fixing them incrementally.
2. Be careful when changing the storage layout of the contract to avoid corrupting user data.
3. Test thoroughly after making changes, especially when modifying reward calculations.

## License

MIT
