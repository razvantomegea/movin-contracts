# MOVINEarnV2 Whitepaper

## Overview

MOVINEarnV2 is a smart contract that implements a token-based rewards system for physical activity tracking. The system combines staking mechanics with activity-based rewards, featuring a referral system and premium user benefits.

## Core Components

### 1. Token System (MovinToken)

- Built on ERC20 standard
- Implements pausable functionality for emergency situations
- Has a maximum supply limit (1 trillion)
- Supports minting and burning operations
- Token ownership is managed by the MOVINEarnV2 contract (or initial deployer)
- **V2 Feature**: Token locking mechanism allowing users to lock their own tokens for a specified duration.

### 2. Staking System

#### Lock Periods

- Supports multiple lock periods: 1, 3, 6, 12, and 24 months
- Each lock period has a corresponding multiplier (1x, 3x, 6x, 12x, 24x)
- Users can have multiple stakes with different lock periods

#### Staking Rewards

- Rewards are calculated based on: stake amount × APR × time staked
- APR is determined by the lock period multiplier
- Rewards can be claimed individually or all at once
- **Reward Expiration**: Staking rewards expire if not claimed within 1 day of the calculation period.
- No burn fee on claiming staking rewards
- 1% burn fee on unstaking (`UNSTAKE_BURN_FEES_PERCENT`)

### 3. Activity Tracking System

#### Steps Tracking

- Daily steps threshold: 10,000 steps (no rewards below and no more steps adding above)
- After each claim rewards, steps should remain at 10,000
- Maximum daily steps: 30,000 steps (no rewards above)
- Rate limit: 300 steps per minute (no rewards for more than 300 steps per minute)
- Rewards: 1 MVN per 10,000 steps (0.1% decrease per day)
- Resets at midnight ((based on activity timestamp))

#### METs (Metabolic Equivalent of Task) Tracking

- Daily METs threshold: 10 METs (no rewards below and no more METs adding above)
- After each claim rewards, METs should remain at 10
- Maximum daily METs: 500 METs (no rewards above)
- Rate limit: 5 METs per minute (no rewards for more than 5 mets per minute)
- Only available for premium users
- Rewards: 1 MVN per 10 METs (0.1% decrease per day)
- Resets at midnight (based on activity timestamp)

### 4. Premium User System

- Premium users can earn additional rewards through METs tracking
- Premium status can only be set by contract owner
- Premium status affects reward calculation and activity tracking
- Enables staking for the 24-month lock period

### 5. Referral System

- Users can refer multiple people
- Each referee can only have one referrer
- Referrer receives 1% of referee's claimed activity rewards (`REFERRAL_BONUS_PERCENT = 100` basis points)
- Referral bonuses are paid automatically when activity rewards are claimed
- Self-referral is not allowed
- Referral relationships cannot be changed once established

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
  - Set premium user status
  - Migrate user data
  - Mint tokens
  - Update lock period multipliers
  - Recover ERC20 tokens (except MOVIN token)

## Technical Details

### Constants

- STEPS_THRESHOLD: 10,000
- METS_THRESHOLD: 10
- MAX_DAILY_STEPS: 30,000
- MAX_DAILY_METS: 500
- MAX_STEPS_PER_MINUTE: 300
- MAX_METS_PER_MINUTE: 5
- UNSTAKE_BURN_FEES_PERCENT: 1
- REFERRAL_BONUS_PERCENT: 100 (1% in basis points)
- HALVING_DECREASE_PERCENT: 1 (Represents 0.1% daily)
- HALVING_RATE_NUMERATOR: 999
- HALVING_RATE_DENOMINATOR: 1000
- REWARD_EXPIRATION_PERIOD: 1 day

### Events

- Staked: Emitted when tokens are staked
- StakingRewardsClaimed: Emitted when staking rewards are claimed
- Unstaked: Emitted when tokens are unstaked
- ActivityRecorded: Emitted when activity is recorded
- RewardsClaimed: Emitted when activity rewards are claimed
- PremiumStatusChanged: Emitted when premium status changes
- RewardsRateDecreased: Emitted when reward rates decrease
- RewardsAccumulated: Emitted when rewards are accumulated
- Deposit: Emitted when tokens are deposited
- ReferralRegistered: Emitted when a referral is registered
- ReferralBonusPaid: Emitted when referral bonus is paid
- AllStakingRewardsClaimed: Emitted when all staking rewards are claimed
- Minted: Emitted when tokens are minted
- UserDataMigrated: Emitted when user data is migrated
- BulkMigrationCompleted: Emitted when bulk migration is completed
- TokensLocked (from MovinToken): Emitted when tokens are locked
- TokensUnlocked (from MovinToken): Emitted when tokens are unlocked

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

## Test Coverage

The contract has comprehensive test coverage including:

- Initialization tests
- Staking functionality tests
- Activity recording and rewards tests
- Daily reward rate decrease tests
- Referral system tests
- Administrative function tests
- Migration functionality tests
- Activity history tests
- Referral rewards tests
- Token functionality tests

All tests are passing, indicating robust implementation of the contract's features.
