# Movin Whitepaper

## Project Overview

Movin is a revolutionary move-to-earn application built on the Base Layer-2 chain of Ethereum that rewards users for their physical activity. Our mission is to promote healthier lifestyles by incentivizing regular exercise through cryptocurrency rewards.

By converting steps and metabolic equivalent of task (METs) into MVN tokens, we create a sustainable ecosystem where fitness and financial rewards go hand in hand. Our vision is to build a global community of health-conscious individuals who are motivated to stay active and earn rewards simultaneously.

## Problem & Solution

### The Problem

Despite knowing the benefits of regular physical activity, many people struggle to maintain consistent exercise habits. Traditional fitness apps lack compelling incentives to keep users engaged long-term, leading to high dropout rates and abandoned fitness goals.

### Our Solution

Movin transforms the fitness experience by introducing tangible, financial rewards for physical activity. By leveraging blockchain technology, we create a transparent, secure system where users earn MVN tokens for their steps and metabolic activity. This creates a powerful incentive loop that encourages consistent exercise habits.

Our app includes sophisticated verification mechanisms to ensure rewards are earned through genuine physical activity, maintaining the integrity of our ecosystem while promoting healthier lifestyles.

## Core Components

### 1. Token System (MVN)

- Built on ERC20 standard
- Implements pausable functionality for emergency situations
- Has a maximum supply limit (1 trillion)
- Initial supply of 11 billion tokens
- Supports minting and burning operations
- Token ownership is managed by the MOVINEarnV2 contract
- Token locking mechanism allowing users to lock their own tokens for a specified duration
- Deflationary design with multiple burning mechanisms: unstaking fee (1%), premium subscription payments

### 2. Staking System

#### Lock Periods and APY

| Lock Period | Multiplier | Availability | APY |
| ----------- | ---------- | ------------ | --- |
| 1 Month     | 1x         | All Users    | 4%  |
| 3 Months    | 3x         | All Users    | 8%  |
| 6 Months    | 6x         | All Users    | 12% |
| 12 Months   | 12x        | All Users    | 18% |
| 24 Months   | 24x        | Premium Only | 24% |

#### Staking Rewards

- Rewards are calculated based on: stake amount × APR × time staked
- APR is determined by the lock period multiplier
- Rewards can be claimed individually or all at once
- For unclaimed rewards that exceed 24 hours, only the most recent modulo 24 hours period is counted
- Minimum reward threshold of 0.001 ether (1 finney) required for claiming
- No burn fee on claiming staking rewards
- 1% burn fee on unstaking (`UNSTAKE_BURN_FEES_PERCENT`)

#### Restaking

- Users can restake their tokens once the lock period has expired
- Restaking avoids the 1% burn fee that would occur with unstaking
- Users can choose a new lock period (1, 3, 6, 12, or 24 months) for the restaked tokens
- 24-month restaking option is reserved for premium users only
- Restaking creates a new stake with the original amount and resets the lock period
- Original stake is removed and a new stake is created with the full amount preserved

### 3. Activity Tracking System

#### Steps Tracking

- Daily steps threshold: 10,000 steps (free users), 5,000 steps (premium users)
- Maximum daily steps: 30,000 steps (no rewards above)
- Rate limit: 300 steps per minute
- Rewards: 1 MVN per threshold reached (0.1% decrease per day)
- Resets at midnight (based on activity timestamp)
- Any positive steps are rewarded, up to a daily cap of 30,000 steps. Rewards are proportional to the number of steps recorded, up to the daily cap. Per-minute (300 steps/min) and daily caps remain enforced. Rewards rates decrease by 0.1% daily, compounded.

#### METs (Metabolic Equivalent of Task) Tracking

- Daily METs threshold: 5 METs (premium users only)
- Maximum daily METs: 500 METs (no rewards above)
- Rate limit: 5 METs per minute
- Only available for premium users
- Rewards: 1 MVN per 5 METs (0.1% decrease per day)
- Resets at midnight (based on activity timestamp)
- Premium users can earn rewards for any positive METs, up to a daily cap of 500 METs. Non-premium users cannot earn METs rewards. Rewards are proportional to the number of METs recorded, up to the daily cap. Per-minute (5 METs/min) and daily caps remain enforced. Rewards rates decrease by 0.1% daily, compounded.

### 4. Subscription Plans

#### Free Plan (Basic)

- 0 MVN / forever
- Basic step tracking (up to 30,000 steps daily)
- Earn MVN tokens for activity
- Staking options up to 12 months
- Referral program (1 MVN bonus for both parties + 1% rewards)
- Import activity from Apple Health & Google Fit
- Contains advertisements

#### Premium Plan (Advanced)

- 100 MVN / month or 1000 MVN / year (save 16%)
- Everything in Free plan
- MET tracking (up to 500 METs daily for premium users)
- Ad-free experience
- Exclusive 24-month staking with 24% APY
- Access to maps and route tracking (soon)
- Friend sync for joint exercises (soon)
- AI based calorie tracking (soon)

### 5. Referral System

- Users can refer multiple people
- Each referee can only have one referrer
- Both referrer and referee receive 1 MVN token when a referral is registered
- Referrer receives 1% of referee's claimed activity rewards (`REFERRAL_BONUS_PERCENT = 100` basis points)
- Referral bonuses are paid automatically when activity rewards are claimed
- Self-referral is not allowed
- Referral relationships cannot be changed once established
- Users can retrieve a list of all their referrals

### 6. Reward Rate System

- Base reward rates decrease by 0.1% daily
- Decrease applies to both steps and METs reward rates
- Decrease is compounded daily
- Rate decrease is tracked using `rewardHalvingTimestamp`

### 7. Migration System

- Supports upgrading from V1 to V2
- Handles data migration for:
  - Stakes
  - Activity data
  - Premium status
  - Referral relationships
- Supports bulk migration of multiple users
- Fixes corrupted data during migration
- Initializes missing fields with appropriate values

### 8. Administrative Functions

- Contract owner can:
  - Pause/unpause the contract
  - Mint tokens
  - Update lock period multipliers
  - Recover ERC20 tokens (except MVN token)
  - Verify reward rates consistency

## Technical Details

### Constants

- STEPS_THRESHOLD: 10,000 (free users)
- PREMIUM_STEPS_THRESHOLD: 5,000 (premium users)
- PREMIUM_METS_THRESHOLD: 5 (premium users only)
- MAX_DAILY_STEPS: 30,000
- MAX_DAILY_METS: 500
- MAX_STEPS_PER_MINUTE: 300
- MAX_METS_PER_MINUTE: 5
- UNSTAKE_BURN_FEES_PERCENT: 1
- REFERRAL_BONUS_PERCENT: 100 (1% in basis points)
- HALVING_DECREASE_PERCENT: 1 (Represents 0.1% daily)
- HALVING_RATE_NUMERATOR: 999
- HALVING_RATE_DENOMINATOR: 1000
- PREMIUM_EXPIRATION_TIME_MONTHLY: 30 days
- PREMIUM_EXPIRATION_TIME_YEARLY: 365 days
- PREMIUM_EXPIRATION_TIME_MONTHLY_AMOUNT: 100 MVN
- PREMIUM_EXPIRATION_TIME_YEARLY_AMOUNT: 1000 MVN

### Events

- Staked: Emitted when tokens are staked
- StakingRewardsClaimed: Emitted when staking rewards are claimed
- Unstaked: Emitted when tokens are unstaked
- Restaked: Emitted when tokens are restaked after lock period expiry
- ActivityRecorded: Emitted when activity is recorded
- RewardsClaimed: Emitted when activity rewards are claimed
- PremiumStatusChanged: Emitted when premium status changes
- RewardsRateDecreased: Emitted when reward rates decrease
- Deposit: Emitted when tokens are deposited
- ReferralRegistered: Emitted when a referral is registered
- ReferralBonusPaid: Emitted when referral bonus is paid
- AllStakingRewardsClaimed: Emitted when all staking rewards are claimed
- Minted: Emitted when tokens are minted
- TokensLocked (from MovinToken): Emitted when tokens are locked
- TokensUnlocked (from MovinToken): Emitted when tokens are unlocked

### Errors

- ZeroAmountNotAllowed: When trying to stake or deposit zero tokens
- InvalidLockPeriod: When an unsupported lock period is specified
- InsufficientBalance: When token balance is too low for an operation
- InsufficientAllowance: When token allowance is too low
- InvalidStakeIndex: When accessing a non-existent stake
- LockPeriodActive: When trying to unstake before lock period expires
- NoRewardsAvailable: When trying to claim non-existent or too small rewards
- InvalidActivityInput: When activity input exceeds rate limits or validation fails
- UnauthorizedAccess: When a user attempts an action they're not authorized for
- ContractPaused: When attempting an action while the contract is paused
- AlreadyReferred: When a user attempts to register a referral more than once
- InvalidReferrer: When attempting to set an invalid referrer
- InvalidPremiumAmount: When attempting to set premium status with an incorrect amount

## Security Features

1. ReentrancyGuard protection on critical functions
2. Pausable functionality for emergency situations
3. Ownable2Step for secure ownership management
4. Input validation for all user inputs
5. Rate limiting for activity recording
6. Proper access control for administrative functions

## Upgradeability

- Contract is upgradeable using UUPS pattern
- State variables are properly organized for upgradeability
- Storage gaps are maintained for future upgrades
- Migration functions ensure smooth upgrades

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

## Team

### Razvan Tomegea

**Founder & Core Developer**

Blockchain developer and entrepreneur based in Romania. Passionate about fitness and technology, with 11 years of experience.

### AI

**Core Developer Assistant**

Advanced AI system that helps with development, user assistance, and data analysis to optimize the Movin experience.
