# Movin Smart Contracts

This project contains the smart contracts for the Movin ecosystem, a move-to-earn application built on the Base Layer-2 chain of Ethereum that rewards users for their physical activity.

## Project Overview

Movin incentivizes regular exercise through cryptocurrency rewards. By converting steps and metabolic equivalent of task (METs) into MVN tokens, we create a sustainable ecosystem where fitness and financial rewards go hand in hand. Our vision is to build a global community of health-conscious individuals who are motivated to stay active and earn rewards simultaneously.

## Contracts

### MovinToken (MVN)

An upgradable ERC20 token with the following features:

- UUPS proxy pattern for upgradeability
- Pausable functionality for emergency situations
- Owner-controlled minting with max supply cap of 1 trillion tokens
- Burn functionality allowing token destruction to reduce total supply
- Custom validation (zero address checks, amount validation)
- Token locking mechanism (`lockTokens`, `unlockTokens`)

### MOVINEarn

A staking and rewards contract that integrates with fitness activity tracking:

- Stake MVN tokens with different lock periods (1, 3, 6, 12, 24 months)
- Higher rewards for longer lock periods (up to 24% APY for 24-month staking)
- Record daily steps and MET (Metabolic Equivalent of Task) activity
- Premium user features with enhanced rewards
- Automatic rewards rate decrease (0.1% daily decrease)
- Migration capabilities for contract upgrades
- Emergency pause functionality
- Strict enforcement of lock periods for staking
- Referral system with 1% bonuses

## Key Features

### Token Burning

The MVN token includes burn functionality:

- `burn(uint256 amount)`: allows users to burn their own tokens
- `burnFrom(address account, uint256 amount)`: allows authorized spenders to burn tokens from other accounts
- Premium subscription payments (100 MVN monthly or 1000 MVN yearly) are burned
- 1% burn fee applied when unstaking tokens

### Staking and Rewards

- Various lock periods with different multipliers:
  | Lock Period | Multiplier | Availability | APY |
  |-------------|------------|--------------|-----|
  | 1 Month | 1x | All Users | 4% |
  | 3 Months | 3x | All Users | 8% |
  | 6 Months | 6x | All Users | 12% |
  | 12 Months | 12x | All Users | 18% |
  | 24 Months | 24x | Premium Only | 24% |
- Reward calculation based on: stake amount × APR × time staked
- **No burn fee** applied when claiming staking or activity rewards
- 1% burn fee applied only when unstaking tokens
- Restaking option to avoid unstaking fee when lock period expires

### Activity Tracking

- Daily steps with different thresholds: 10,000 steps (free users), 5,000 steps (premium users) for rewards (Max daily: 30,000)
- MET tracking (premium users only) with 5 MET threshold (Max daily: 500)
- Automatic reset at midnight
- Per-minute limits enforced: 300 steps/min, 5 METs/min
- Activity rewards: 1 MVN per threshold reached (5,000 steps for premium, 10,000 for free; 5 METs for premium)
- Rewards rates decrease by 0.1% daily, compounded

### Premium Benefits

- Lower step threshold for rewards (5,000 vs 10,000 steps)
- Access to MET-based rewards (5 MET threshold)
- Enhanced earning potential
- Ability to stake for the 24-month lock period (24% APY)
- Ad-free experience in the app
- Future features including maps, route tracking, and AI-based calorie tracking

### Subscription Plans

- **Free Plan**: Basic step tracking (10,000 step threshold), earn MVN tokens, staking up to 12 months, referral program
- **Premium Plan**: 100 MVN/month or 1000 MVN/year, includes lower step threshold (5,000 steps), MET tracking (5 MET threshold), ad-free experience, exclusive 24-month staking with 24% APY, and access to future premium features

### Referral System

- Users can register a referrer
- Both referrer and referee receive 1 MVN token upon registration
- Referrers receive 1% of referee's claimed activity rewards
- Activity bonuses are added to referrer's daily activity
- Users can have multiple referrals, but each user can only have one referrer

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
const MovinToken = await ethers.getContractFactory('MovinToken');
const MOVINEarnV2 = await ethers.getContractFactory('MOVINEarnV2');

// Attach to deployed contracts (Update with your V2 deployment addresses)
const token = await MovinToken.attach('YOUR_MOVIN_TOKEN_V2_PROXY_ADDRESS');
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
await earnV2.connect(user1).recordActivity(5000, 5); // Record steps and METs (premium thresholds)
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

- **Owner Signature Verification**: All user-facing functions require valid EIP-712 signatures from the contract owner
- **Nonce-based Replay Protection**: Each user has an incrementing nonce to prevent signature replay attacks
- **Time-bound Signatures**: All signatures include deadlines to prevent indefinite validity
- ReentrancyGuard for protection against reentrancy attacks
- Proper access control with Ownable2Step
- Pausable functionality for emergency situations
- Input validation to prevent invalid operations

### Smart Contract Architecture

```
MovinToken / MovinToken
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
- Test suites (`test/MOVINEarnV2.test.ts`, `test/MovinToken.test.ts` if exists) - For automated unit/integration tests.
- `scripts/check-migration.ts` - For checking the migration status (if applicable).
- `scripts/test-activity-record.ts` - For focused testing of activity recording features.
- `scripts/deposit.ts` - Example script showing signature-based interactions.

**Important Notes for V2 Contract Interactions:**

- **All user-facing functions require owner signatures** - Use the SignatureHelper class in tests or backend signature generation in production
- The V2 contract enforces per-minute limits (300 steps/min, 5 METs/min)
- Daily limits are also enforced (30,000 steps/day, 500 METs/day)
- Staking and Activity rewards expire if not claimed within 1 day
- Each signature must include a valid nonce and deadline
- Signatures use EIP-712 typed data format for security

## wagmi React Integration

### Using MOVINEarnV2 with Owner Signatures

MOVINEarnV2 requires owner signatures for all user-facing functions to prevent unauthorized access. Here's how to integrate it with wagmi in a React application:

#### Setup

```typescript
// hooks/useMovinEarn.ts
import { useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { useSignTypedData } from 'wagmi';
import { parseEther, encodeFunctionData, keccak256, toUtf8Bytes } from 'viem';

const MOVIN_EARN_V2_ABI = [
  // Add your contract ABI here
  'function stakeTokens(uint256 amount, uint256 lockMonths, uint256 nonce, uint256 deadline, bytes calldata signature) external',
  'function getNonce(address user) external view returns (uint256)',
  'function recordActivity(address user, uint256 newSteps, uint256 newMets, uint256 nonce, uint256 deadline, bytes calldata signature) external',
  'function claimStakingRewards(uint256 stakeIndex, uint256 nonce, uint256 deadline, bytes calldata signature) external',
  // ... other functions
] as const;

const MOVIN_EARN_V2_ADDRESS = '0x...'; // Your deployed contract address
const CHAIN_ID = 8453; // Base mainnet

// EIP-712 Domain
const domain = {
  name: 'MOVINEarnV2',
  version: '2',
  chainId: CHAIN_ID,
  verifyingContract: MOVIN_EARN_V2_ADDRESS,
} as const;

// EIP-712 Types
const types = {
  FunctionCall: [
    { name: 'caller', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// Helper function to get function selector
function getFunctionSelector(functionSignature: string): `0x${string}` {
  return keccak256(toUtf8Bytes(functionSignature)).slice(0, 10) as `0x${string}`;
}
```

#### Hook for Contract Interactions with Signatures

```typescript
// hooks/useMovinEarnWithSignature.ts
import { useState } from 'react';
import { useAccount, useContractRead, useContractWrite } from 'wagmi';

export function useMovinEarnWithSignature() {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);

  // Get user's current nonce
  const { data: nonce } = useContractRead({
    address: MOVIN_EARN_V2_ADDRESS,
    abi: MOVIN_EARN_V2_ABI,
    functionName: 'getNonce',
    args: [address!],
    enabled: !!address,
  });

  // Sign typed data hook
  const { signTypedDataAsync } = useSignTypedData();

  // Contract write hook
  const { writeAsync: stakeTokensWrite } = useContractWrite({
    address: MOVIN_EARN_V2_ADDRESS,
    abi: MOVIN_EARN_V2_ABI,
    functionName: 'stakeTokens',
  });

  const { writeAsync: recordActivityWrite } = useContractWrite({
    address: MOVIN_EARN_V2_ADDRESS,
    abi: MOVIN_EARN_V2_ABI,
    functionName: 'recordActivity',
  });

  // Function to stake tokens with owner signature
  const stakeTokens = async (amount: string, lockMonths: number, ownerPrivateKey: string) => {
    if (!address || !nonce) throw new Error('User not connected or nonce not loaded');

    setIsLoading(true);
    try {
      // Create deadline (24 hours from now)
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      // Get function selector
      const selector = getFunctionSelector('stakeTokens(uint256,uint256,uint256,uint256,bytes)');

      // Create message for signing
      const message = {
        caller: address,
        selector,
        nonce: Number(nonce),
        deadline: BigInt(deadline),
      };

      // Sign the message (this would typically be done by the owner/backend)
      // In production, you'd send this to your backend for the owner to sign
      const signature = await signOwnerMessage(message, ownerPrivateKey);

      // Execute the transaction
      const tx = await stakeTokensWrite({
        args: [parseEther(amount), lockMonths, nonce, deadline, signature],
      });

      return tx;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to record activity with owner signature
  const recordActivity = async (steps: number, mets: number, ownerPrivateKey: string) => {
    if (!address || !nonce) throw new Error('User not connected or nonce not loaded');

    setIsLoading(true);
    try {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const selector = getFunctionSelector(
        'recordActivity(address,uint256,uint256,uint256,uint256,bytes)'
      );

      const message = {
        caller: address,
        selector,
        nonce: Number(nonce),
        deadline: BigInt(deadline),
      };

      const signature = await signOwnerMessage(message, ownerPrivateKey);

      const tx = await recordActivityWrite({
        args: [address, steps, mets, nonce, deadline, signature],
      });

      return tx;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    stakeTokens,
    recordActivity,
    isLoading,
    nonce,
  };
}

// Helper function to sign message with owner's private key
// In production, this should be done on your backend for security
async function signOwnerMessage(message: any, ownerPrivateKey: string) {
  // This is a simplified example - in production you'd use your backend
  const { signTypedData } = await import('viem/accounts');
  const { privateKeyToAccount } = await import('viem/accounts');

  const ownerAccount = privateKeyToAccount(ownerPrivateKey as `0x${string}`);

  const signature = await signTypedData({
    domain,
    types,
    primaryType: 'FunctionCall',
    message,
    privateKey: ownerAccount.privateKey,
  });

  return signature;
}
```

#### React Component Example

```tsx
// components/StakingInterface.tsx
import { useState } from 'react';
import { useMovinEarnWithSignature } from '../hooks/useMovinEarnWithSignature';
import { useAccount } from 'wagmi';

export function StakingInterface() {
  const { address, isConnected } = useAccount();
  const { stakeTokens, recordActivity, isLoading } = useMovinEarnWithSignature();

  const [amount, setAmount] = useState('');
  const [lockPeriod, setLockPeriod] = useState(1);
  const [steps, setSteps] = useState(0);
  const [mets, setMets] = useState(0);

  // In production, owner signature would be obtained from your backend
  const OWNER_PRIVATE_KEY = process.env.REACT_APP_OWNER_PRIVATE_KEY || '';

  const handleStake = async () => {
    try {
      const tx = await stakeTokens(amount, lockPeriod, OWNER_PRIVATE_KEY);
      console.log('Stake transaction:', tx);
      // Handle success (e.g., show notification, update UI)
    } catch (error) {
      console.error('Staking failed:', error);
      // Handle error
    }
  };

  const handleRecordActivity = async () => {
    try {
      const tx = await recordActivity(steps, mets, OWNER_PRIVATE_KEY);
      console.log('Activity recorded:', tx);
      // Handle success
    } catch (error) {
      console.error('Recording activity failed:', error);
      // Handle error
    }
  };

  if (!isConnected) {
    return <div>Please connect your wallet</div>;
  }

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Movin Staking</h2>

      {/* Staking Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Stake Tokens</h3>
        <input
          type="number"
          placeholder="Amount (MVN)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full p-2 border rounded mb-2"
        />
        <select
          value={lockPeriod}
          onChange={e => setLockPeriod(Number(e.target.value))}
          className="w-full p-2 border rounded mb-2"
        >
          <option value={1}>1 Month (4% APY)</option>
          <option value={3}>3 Months (8% APY)</option>
          <option value={6}>6 Months (12% APY)</option>
          <option value={12}>12 Months (18% APY)</option>
          <option value={24}>24 Months (24% APY) - Premium Only</option>
        </select>
        <button
          onClick={handleStake}
          disabled={isLoading || !amount}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Staking...' : 'Stake Tokens'}
        </button>
      </div>

      {/* Activity Section */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Record Activity</h3>
        <input
          type="number"
          placeholder="Steps"
          value={steps}
          onChange={e => setSteps(Number(e.target.value))}
          className="w-full p-2 border rounded mb-2"
        />
        <input
          type="number"
          placeholder="METs (Premium only)"
          value={mets}
          onChange={e => setMets(Number(e.target.value))}
          className="w-full p-2 border rounded mb-2"
        />
        <button
          onClick={handleRecordActivity}
          disabled={isLoading || (!steps && !mets)}
          className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:opacity-50"
        >
          {isLoading ? 'Recording...' : 'Record Activity'}
        </button>
      </div>
    </div>
  );
}
```

#### Production Security Considerations

**⚠️ Important Security Notes:**

1. **Never expose the owner's private key in frontend code**
2. **Use a backend service for signature generation in production**
3. **Implement proper authentication and rate limiting**
4. **All user-facing functions require owner signatures for security**
5. **Signatures have time-based expiration (24 hours recommended)**
6. **Each user has a unique nonce to prevent replay attacks**

#### Backend API Example

```typescript
// backend/api/sign-function.ts (Express.js example)
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedData } from 'viem/accounts';

const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY!; // Secure environment variable
const ownerAccount = privateKeyToAccount(OWNER_PRIVATE_KEY as `0x${string}`);

export async function POST(req: Request) {
  const { caller, selector, nonce, deadline, userToken } = await req.json();

  // Verify user authentication
  if (!(await verifyUserToken(userToken))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Additional validation (rate limiting, user permissions, etc.)

  const message = { caller, selector, nonce, deadline };

  const signature = await signTypedData({
    domain: {
      name: 'MOVINEarnV2',
      version: '2',
      chainId: 8453,
      verifyingContract: MOVIN_EARN_V2_ADDRESS,
    },
    types: {
      FunctionCall: [
        { name: 'caller', type: 'address' },
        { name: 'selector', type: 'bytes4' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'FunctionCall',
    message,
    privateKey: ownerAccount.privateKey,
  });

  return Response.json({ signature });
}
```

This example demonstrates the complete flow for integrating MOVINEarnV2's signature-based functions with wagmi and React, while emphasizing security best practices for production use.

#### Key Benefits of the Signature System

- **Enhanced Security**: Owner-controlled access to all user functions
- **Replay Protection**: Nonce-based system prevents signature reuse
- **Time-bounded Access**: Signatures expire automatically for security
- **EIP-712 Standard**: Industry-standard typed data signing
- **Flexible Authorization**: Backend can implement custom business logic before signing
- **Audit Trail**: All actions are cryptographically verifiable

## Development Guidelines

1. When fixing linter errors, prioritize fixing them incrementally.
2. Be careful when changing the storage layout of the contract to avoid corrupting user data.
3. Test thoroughly after making changes, especially when modifying reward calculations.

## License

MIT

## Roadmap

### Q1-Q2 2025: MVP Launch

- MVN contracts launch on the Base Layer-2 chain of Ethereum
- Core step and METs tracking functionality
- Basic staking mechanisms implementation
- Premium user features including HealthKit and Google Fit integration
- Referral program
- App launch on Apple Store and Google Play
- Public token listing on Uniswap, Gate.io, and Base

### Q3-Q4 2025: Social Feed Features

- Social feed for sharing achievements
- Enhanced social interactions and activity sharing
- Custom route creation and sharing

### Q1 2026: Advanced Geolocation Features

- Friend sync for joint exercises and shared rewards
- Group activity tracking and leaderboards
- Location and route tracking with interactive maps

### Q2 2026: Gamified Experience

- Community challenges with special rewards
- Achievement badges and milestone rewards

### Q3 2026: AI Integration

- AI based calorie tracking
- AI based personalized fitness recommendations

### Q4 2026: Borrowing

- Ability to borrow MVN tokens from the protocol

### 2027: Partnerships

- Partnerships with fitness brands and organizations
- MVN token listing on more exchanges
- More features and integrations
