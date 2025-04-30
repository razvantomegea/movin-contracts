// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';

import './MovinToken.sol';

error ZeroAmountNotAllowed();
error InvalidLockPeriod(uint256 lockMonths);
error InsufficientBalance(uint256 available, uint256 required);
error InsufficientAllowance(uint256 allowed, uint256 required);
error InvalidStakeIndex(uint256 index, uint256 maxIndex);
error LockPeriodActive(uint256 unlockTime);
error NoRewardsAvailable();
error RewardsExpired();
error InvalidActivityInput();
error UnauthorizedAccess();
error ContractPaused();
error AlreadyReferred();
error InvalidReferrer();

contract MOVINEarnV2 is
  UUPSUpgradeable,
  Ownable2StepUpgradeable,
  ReentrancyGuardUpgradeable,
  PausableUpgradeable
{
  MovinToken public movinToken;
  ERC20Upgradeable public erc20MovinToken;

  struct Stake {
    uint256 amount;
    uint256 startTime;
    uint256 lockDuration;
    uint256 lastClaimed;
  }
  struct UserActivity {
    uint256 dailySteps;
    uint256 dailyMets;
    uint256 pendingStepsRewards;
    uint256 pendingMetsRewards;
    uint256 lastRewardAccumulationTime;
    bool isPremium;
    uint256 lastUpdated;
  }
  struct ActivityRecord {
    uint256 value;
    uint256 timestamp;
  }
  struct ReferralInfo {
    address referrer;
    uint256 earnedBonus;
    uint256 referralCount;
  }

  event Staked(address indexed user, uint256 amount, uint256 lockPeriod, uint256 stakeIndex);
  event StakingRewardsClaimed(address indexed user, uint256 stakeIndex, uint256 reward);
  event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex);
  event ActivityRecorded(
    address indexed user,
    uint256 newSteps,
    uint256 newMets,
    uint256 remainingSteps,
    uint256 remainingMets,
    uint256 timestamp
  );

  event RewardsClaimed(
    address indexed user,
    uint256 stepsReward,
    uint256 metsReward,
    uint256 totalReward
  );
  event PremiumStatusChanged(address indexed user, bool status);
  event RewardsRateDecreased(
    uint256 newStepsRate,
    uint256 newMetsRate,
    uint256 nextDecreaseTimestamp
  );
  event Deposit(address indexed sender, uint256 amount);

  event ReferralRegistered(address indexed user, address indexed referrer);
  event ReferralBonusPaid(address indexed referrer, address indexed referee, uint256 amount);

  event AllStakingRewardsClaimed(address indexed user, uint256 totalReward, uint256 stakeCount);

  event Minted(address indexed user, uint256 amount);

  event UserDataMigrated(address indexed user, bool success);
  event BulkMigrationCompleted(uint256 totalUsers, uint256 successCount);

  mapping(uint256 => uint256) public lockPeriodMultipliers;
  mapping(address => Stake[]) public userStakes;
  mapping(address => UserActivity) public userActivities;
  mapping(address => ActivityRecord[]) public userStepsHistory;
  mapping(address => ActivityRecord[]) public userMetsHistory;

  uint256 public constant STEPS_THRESHOLD = 10_000;
  uint256 public constant METS_THRESHOLD = 10;
  uint256 public rewardHalvingTimestamp;
  uint256 public baseStepsRate;
  uint256 public baseMetsRate;
  uint256 public constant MAX_DAILY_STEPS = 30_000;
  uint256 public constant MAX_DAILY_METS = 500;
  uint256 public constant MAX_STEPS_PER_MINUTE = 300;
  uint256 public constant MAX_METS_PER_MINUTE = 5;
  uint256 public constant UNSTAKE_BURN_FEES_PERCENT = 1;
  uint256 public constant REFERRAL_BONUS_PERCENT = 100; // 100 = 1% (using basis points for better precision)
  uint256 public constant HALVING_DECREASE_PERCENT = 1; // Represents 0.1% (used for documentation only)
  uint256 public constant HALVING_RATE_NUMERATOR = 999; // 999/1000 = 0.999 (99.9%)
  uint256 public constant HALVING_RATE_DENOMINATOR = 1000; // For 0.1% daily decrease

  address public migrator;

  mapping(address => ReferralInfo) public userReferrals;
  mapping(address => address[]) public referrals;

  // Storage gap for future upgrades
  uint256[48] private __gap; // Changed from 50 to 48 to account for new V2 variables

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address _tokenAddress) public initializer {
    __Ownable_init(msg.sender);
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    __Pausable_init();

    movinToken = MovinToken(_tokenAddress);
    erc20MovinToken = ERC20Upgradeable(_tokenAddress);
    rewardHalvingTimestamp = block.timestamp;
    baseStepsRate = 1 * 10 ** 18;
    baseMetsRate = 1 * 10 ** 18;

    lockPeriodMultipliers[1] = 1;
    lockPeriodMultipliers[3] = 3;
    lockPeriodMultipliers[6] = 6;
    lockPeriodMultipliers[12] = 12;
    lockPeriodMultipliers[24] = 24;
  }

  // V2: Initialize function for upgrading to V2 (not used in actual upgrade since state is preserved)
  function initializeV2() public reinitializer(2) {
    // No changes to rewardHalvingTimestamp to preserve the existing halving schedule
    // Note: rewardHalvingTimestamp is intentionally preserved from V1 to maintain reward decrease cadence
  }

  function initializeMigration(address _migrator) external onlyOwner {
    require(migrator == address(0), 'Migration already initialized');
    migrator = _migrator;
  }

  modifier onlyMigrator() {
    require(msg.sender == migrator, 'Caller is not migrator');
    _;
  }

  function stakeTokens(
    uint256 amount,
    uint256 lockMonths
  ) external nonReentrant whenNotPausedWithRevert {
    if (amount == 0) revert ZeroAmountNotAllowed();
    if (lockPeriodMultipliers[lockMonths] == 0) revert InvalidLockPeriod(lockMonths);
    if (lockMonths == 24 && !userActivities[msg.sender].isPremium) revert UnauthorizedAccess();

    erc20MovinToken.transferFrom(msg.sender, address(this), amount);

    uint256 lockPeriod = lockMonths * 30 days;
    userStakes[msg.sender].push(
      Stake({
        amount: amount,
        startTime: block.timestamp,
        lockDuration: lockPeriod,
        lastClaimed: block.timestamp
      })
    );

    emit Staked(msg.sender, amount, lockPeriod, userStakes[msg.sender].length - 1);
  }

  function claimStakingRewards(uint256 stakeIndex) external nonReentrant whenNotPausedWithRevert {
    uint256 stakeCount = userStakes[msg.sender].length;

    if (stakeIndex >= stakeCount) {
      revert InvalidStakeIndex(stakeIndex, stakeCount - 1);
    }

    Stake storage stake = userStakes[msg.sender][stakeIndex]; // Use storage reference

    // Calculate reward (will be 0 if expired due to logic in calculateStakingReward)
    uint256 reward = calculateStakingReward(stakeIndex);

    // Update lastClaimed regardless of reward amount to reset the timer
    stake.lastClaimed = block.timestamp;

    // Add minimum threshold of 1 finney (0.001 ether) to prevent claiming tiny amounts
    if (reward == 0 || reward < 0.001 ether) {
      // If expired or reward is too small, revert with NoRewardsAvailable
      // This avoids unnecessary token distribution attempts
      revert NoRewardsAvailable();
    }

    // Use _distributeTokens helper to mint tokens if needed
    _distributeTokens(msg.sender, reward, false);

    emit StakingRewardsClaimed(msg.sender, stakeIndex, reward);
  }

  function claimAllStakingRewards() external nonReentrant whenNotPausedWithRevert {
    uint256 stakeCount = userStakes[msg.sender].length;
    if (stakeCount == 0) revert NoRewardsAvailable();

    // First pass: calculate total rewards and identify stakes with rewards
    uint256 totalReward = 0;
    bool hasRewards = false;

    for (uint256 i; i < stakeCount; ++i) {
      // Calculate reward (will be 0 if expired due to logic in calculateStakingReward)
      uint256 reward = calculateStakingReward(i);
      if (reward > 0) {
        totalReward += reward;
        hasRewards = true;
      }
    }

    // Explicit check for rewards availability
    // Add minimum threshold of 1 finney (0.001 ether) to prevent claiming tiny amounts
    if (!hasRewards || totalReward == 0 || totalReward < 0.001 ether) revert NoRewardsAvailable();

    // Store the current timestamp once to ensure consistency
    uint256 currentTimestamp = block.timestamp;

    // Update lastClaimed timestamps for all stakes, not just ones with rewards
    for (uint256 i; i < stakeCount; ++i) {
      userStakes[msg.sender][i].lastClaimed = currentTimestamp;
    }

    // Distribute rewards using the helper function
    _distributeTokens(msg.sender, totalReward, false);

    // Emit event
    emit AllStakingRewardsClaimed(msg.sender, totalReward, stakeCount);
  }

  function unstake(uint256 stakeIndex) external nonReentrant whenNotPausedWithRevert {
    uint256 stakeCount = userStakes[msg.sender].length;

    if (stakeIndex >= stakeCount) revert InvalidStakeIndex(stakeIndex, stakeCount - 1);

    Stake storage stake = userStakes[msg.sender][stakeIndex];
    uint256 unlockTime = stake.startTime + stake.lockDuration;

    // Check if the lock period is still active
    if (block.timestamp < unlockTime) {
      revert LockPeriodActive(unlockTime);
    }

    uint256 burnAmount = (stake.amount * UNSTAKE_BURN_FEES_PERCENT) / 100;
    uint256 userPayout = stake.amount - burnAmount;
    _distributeTokens(msg.sender, userPayout, false);
    movinToken.burn(burnAmount);
    _removeStake(msg.sender, stakeIndex);

    emit Unstaked(msg.sender, stake.amount, stakeIndex);
  }

  function getUserStakes(address user) external view returns (Stake[] memory) {
    return userStakes[user];
  }

  function getUserStake(uint256 index) external view returns (Stake memory) {
    if (index >= userStakes[msg.sender].length) {
      revert InvalidStakeIndex(index, userStakes[msg.sender].length - 1);
    }

    return userStakes[msg.sender][index];
  }

  function getUserStakeCount() external view returns (uint256) {
    return userStakes[msg.sender].length;
  }

  function calculateActivityRewards(
    uint256 newSteps,
    uint256 newMets
  ) public view returns (uint256, uint256, uint256, uint256) {
    UserActivity storage activity = userActivities[msg.sender];
    uint256 currentDayOfYear = ((block.timestamp / 86400) % 365) + 1;
    uint256 activityDay = ((activity.lastUpdated / 86400) % 365) + 1;
    uint256 dailySteps = activity.dailySteps;
    uint256 dailyMets = activity.dailyMets;

    // Check if activity doesn't exist or timestamp doesn't match current day
    if (activityDay != currentDayOfYear) {
      dailySteps = 0;
      dailyMets = 0;
    }

    uint256 stepsReward = 0;
    uint256 todaySteps = dailySteps + newSteps;

    if (dailySteps >= STEPS_THRESHOLD && dailySteps < MAX_DAILY_STEPS) {
      stepsReward = (newSteps * baseStepsRate) / STEPS_THRESHOLD;
    } else if (todaySteps >= STEPS_THRESHOLD && todaySteps <= MAX_DAILY_STEPS) {
      stepsReward = (todaySteps * baseStepsRate) / STEPS_THRESHOLD;
    }

    if (!activity.isPremium) {
      return (stepsReward, 0, todaySteps, 0);
    }

    uint256 metsReward = 0;
    uint256 todayMets = dailyMets + newMets;

    if (dailyMets >= METS_THRESHOLD && dailyMets < MAX_DAILY_METS) {
      metsReward = (newMets * baseMetsRate) / METS_THRESHOLD;
    } else if (todayMets >= METS_THRESHOLD && todayMets <= MAX_DAILY_METS) {
      metsReward = (todayMets * baseMetsRate) / METS_THRESHOLD;
    }

    return (stepsReward, metsReward, todaySteps, todayMets);
  }

  function calculateStakingReward(uint256 stakeIndex) public view returns (uint256) {
    Stake storage stake = userStakes[msg.sender][stakeIndex];

    uint256 timeSinceLastClaimed = block.timestamp - stake.lastClaimed;
    uint256 effectiveDuration;

    // Check if more than 1 day has passed since last claim
    if (timeSinceLastClaimed > 1 days) {
      // Calculate the remaining hours after taking modulo 24 hours
      effectiveDuration = timeSinceLastClaimed % 1 days;
    } else {
      // Less than 24 hours passed, use the entire duration
      effectiveDuration = timeSinceLastClaimed;
    }

    uint256 lockMonths = stake.lockDuration / 30 days;
    uint256 apr = lockPeriodMultipliers[lockMonths];

    // Calculate reward: (amount * apr * effectiveDuration) / (100 * 365 days)
    // The division by 100 converts apr from percentage to decimal
    // The division by 365 days is because APR is annual
    uint256 reward = (stake.amount * apr * effectiveDuration) / (100 * 365 days);

    return reward;
  }

  function recordActivity(uint256 newSteps, uint256 newMets) external whenNotPausedWithRevert {
    // Skip validation completely if both inputs are zero
    // This allows referral registration to work properly
    if (newSteps <= 0 && newMets <= 0) {
      return;
    }

    // Calculate day of year (1-365) using integer division
    // block.timestamp / 86400 gives us days since epoch
    // % 365 gives us day of year (0-364)
    // + 1 gives us day of year (1-365)
    uint256 currentDayOfYear = ((block.timestamp / 86400) % 365) + 1;
    UserActivity storage activity = userActivities[msg.sender];
    uint256 activityDay = ((activity.lastUpdated / 86400) % 365) + 1;

    // Check if activity doesn't exist or timestamp doesn't match current day
    if (activityDay != currentDayOfYear) {
      activity.dailySteps = 0;
      activity.dailyMets = 0;
    }

    // Calculate elapsed minutes (rounded down) since last update
    uint256 elapsedTime = activity.lastUpdated > 0 ? (block.timestamp - activity.lastUpdated) : 0;
    uint256 elapsedMinutes = elapsedTime / 60;

    // First-time activity recording
    bool isFirstActivity = activity.lastUpdated == 0 ||
      (activity.dailySteps == 0 && activity.dailyMets == 0);

    // Check time-based limits for physically possible activity
    if (!isFirstActivity) {
      if (elapsedMinutes > 0) {
        // Calculate maximum possible steps in the elapsed time
        uint256 maxPossibleSteps = elapsedMinutes * MAX_STEPS_PER_MINUTE;
        uint256 maxPossibleMets = elapsedMinutes * MAX_METS_PER_MINUTE;

        // Simpler validation that prevents underflow errors
        if (newSteps > 0 && activity.dailySteps > 0 && newSteps > maxPossibleSteps) {
          revert InvalidActivityInput();
        }

        if (newMets > 0 && activity.dailyMets > 0 && newMets > maxPossibleMets) {
          revert InvalidActivityInput();
        }
      } else if (elapsedMinutes <= 0) {
        // Prevent activity recording too frequently (must wait at least 1 minute)
        revert InvalidActivityInput();
      }
    }

    _checkDailyDecrease();

    // Calculate rewards based on current daily totals
    (
      uint256 stepsReward,
      uint256 metsReward,
      uint256 todaySteps,
      uint256 todayMets
    ) = calculateActivityRewards(newSteps, newMets);

    activity.dailySteps = todaySteps;
    activity.dailyMets = todayMets;

    emit ActivityRecorded(
      msg.sender,
      todaySteps,
      todayMets,
      todaySteps,
      todayMets,
      block.timestamp
    );

    uint256 totalReward = stepsReward + metsReward;

    // Send full reward to user
    _distributeTokens(msg.sender, totalReward, true);

    activity.lastUpdated = block.timestamp;

    // Calculate and send referral bonus to referrer if exists
    address referrer = userReferrals[msg.sender].referrer;

    if (referrer != address(0)) {
      // Calculate referral bonus using basis points (100 = 1%)
      uint256 referralBonus = (totalReward * REFERRAL_BONUS_PERCENT) / 10000;

      // Send referral bonus to referrer
      if (referralBonus > 0) {
        _distributeTokens(referrer, referralBonus, true);

        // Update referrer's earned bonus
        userReferrals[referrer].earnedBonus += referralBonus;

        // Emit referral bonus event
        emit ReferralBonusPaid(referrer, msg.sender, referralBonus);
      }
    }

    emit RewardsClaimed(msg.sender, stepsReward, metsReward, totalReward);
  }

  function getTodayUserActivity() external view returns (UserActivity memory) {
    uint256 currentDayOfYear = ((block.timestamp / 86400) % 365) + 1;
    UserActivity storage activity = userActivities[msg.sender];
    uint256 activityDay = ((activity.lastUpdated / 86400) % 365) + 1;

    if (activityDay != currentDayOfYear) {
      return
        UserActivity({
          dailySteps: 0,
          dailyMets: 0,
          pendingStepsRewards: 0,
          pendingMetsRewards: 0,
          lastRewardAccumulationTime: block.timestamp,
          isPremium: activity.isPremium,
          lastUpdated: block.timestamp
        });
    }

    return activity;
  }

  function getBaseRates() public view returns (uint256 stepsRate, uint256 metsRate) {
    uint256 currentMidnight = block.timestamp;
    uint256 newStepsRate = baseStepsRate;
    uint256 newMetsRate = baseMetsRate;

    if (currentMidnight >= rewardHalvingTimestamp + 1 days) {
      // Calculate number of days passed since last decrease
      uint256 daysPassed = (currentMidnight - rewardHalvingTimestamp) / 86400;

      // Apply 0.1% decrease for each day
      for (uint256 i; i < daysPassed; ++i) {
        newStepsRate = (newStepsRate * HALVING_RATE_NUMERATOR) / HALVING_RATE_DENOMINATOR; // Decrease by 0.1%
        newMetsRate = (newMetsRate * HALVING_RATE_NUMERATOR) / HALVING_RATE_DENOMINATOR; // Decrease by 0.1%
      }
    }

    return (newStepsRate, newMetsRate);
  }

  function registerReferral(address referrer) external whenNotPausedWithRevert {
    if (referrer == address(0) || referrer == msg.sender) {
      revert InvalidReferrer();
    }

    if (userReferrals[msg.sender].referrer != address(0)) {
      revert AlreadyReferred();
    }

    // Register the referral
    userReferrals[msg.sender].referrer = referrer;
    referrals[referrer].push(msg.sender);
    userReferrals[referrer].referralCount++;

    emit ReferralRegistered(msg.sender, referrer);
  }

  function getReferralInfo(
    address user
  ) external view returns (address referrer, uint256 earnedBonus, uint256 referralCount) {
    ReferralInfo storage info = userReferrals[user];
    return (info.referrer, info.earnedBonus, info.referralCount);
  }

  // V2: New function to get all referrals of a user
  function getUserReferrals(address user) external view returns (address[] memory) {
    return referrals[user];
  }

  function importStakes(address user, Stake[] memory stakes) internal onlyMigrator {
    for (uint256 i; i < stakes.length; ++i) {
      userStakes[user].push(stakes[i]);
    }
  }

  function importActivityData(
    address user,
    uint256 steps,
    uint256 mets,
    uint256 timestamp
  ) internal onlyMigrator {
    userActivities[user].dailySteps = steps;
    userActivities[user].dailyMets = mets;
    userActivities[user].lastUpdated = timestamp;
  }

  function importPremiumStatus(address user, bool status) internal onlyMigrator {
    userActivities[user].isPremium = status;
  }

  function importLockPeriods(
    uint256[] calldata months,
    uint256[] calldata multipliers
  ) internal onlyMigrator {
    for (uint256 i; i < months.length; ++i) {
      lockPeriodMultipliers[months[i]] = multipliers[i];
    }
  }

  function importReferralNetwork(
    address referrer,
    address[] memory referees
  ) internal onlyMigrator {
    referrals[referrer] = referees;
    userReferrals[referrer].referralCount = referees.length;
  }

  // V2: Function to migrate data for multiple users at once
  function bulkMigrateUserData(address[] calldata users) external onlyOwner {
    uint256 successCount = 0;

    for (uint256 i = 0; i < users.length; i++) {
      address user = users[i];
      bool success = true;

      try this.migrateUserData(user) {
        successCount++;
        emit UserDataMigrated(user, true);
      } catch {
        emit UserDataMigrated(user, false);
        success = false;
      }
    }

    emit BulkMigrationCompleted(users.length, successCount);
  }

  // V2: Function to migrate a single user's data
  function migrateUserData(address user) external onlyOwner {
    bool stakesMigrated = false;
    bool activityMigrated = false;
    bool referralMigrated = false;

    // First verify and migrate stakes data if needed
    Stake[] storage stakes = userStakes[user];
    // Ensure stakes are valid - if stake amount is 0, it's likely corrupted
    for (uint256 i = 0; i < stakes.length; i++) {
      if (stakes[i].amount == 0 || stakes[i].startTime == 0) {
        // Remove invalid stake to prevent issues
        _removeStake(user, i);
        i--; // Adjust index after removal
      } else if (stakes[i].lastClaimed == 0) {
        // Fix stake with missing lastClaimed
        stakes[i].lastClaimed = stakes[i].startTime;
      }
    }
    stakesMigrated = true;

    // Verify and migrate activity data
    UserActivity storage activity = userActivities[user];

    // Initialize lastUpdated to current timestamp if not set (crucial for V2)
    if (activity.lastUpdated == 0) {
      // In V1, we used lastMidnightReset and lastHourlyReset
      // Set lastUpdated to block.timestamp for new structure
      activity.lastUpdated = block.timestamp;
    }

    // Calculate day of year (1-365) using integer division
    // block.timestamp / 86400 gives us days since epoch
    // % 365 gives us day of year (0-364)
    // + 1 gives us day of year (1-365)
    uint256 currentDayOfYear = ((block.timestamp / 86400) % 365) + 1;

    // Calculate last updated day of year using integer division
    uint256 lastUpdated = ((activity.lastUpdated / 86400) % 365) + 1;

    // Reset daily activity if it's from a previous day
    if (lastUpdated != currentDayOfYear) {
      activity.dailySteps = 0;
      activity.dailyMets = 0;
      activity.lastUpdated = block.timestamp;
    }

    activityMigrated = true;

    // Migrate referral data
    ReferralInfo storage referralInfo = userReferrals[user];

    // Check if user has referrals but no count is recorded
    address[] storage currentUserReferrals = referrals[user];
    if (currentUserReferrals.length > 0 && referralInfo.referralCount == 0) {
      referralInfo.referralCount = currentUserReferrals.length;
    }
    referralMigrated = true;

    // Emit success only if all components were migrated successfully
    if (stakesMigrated && activityMigrated && referralMigrated) {
      emit UserDataMigrated(user, true);
    } else {
      emit UserDataMigrated(user, false);
      revert('Migration failed');
    }
  }

  // V2: Function to migrate base rates and halving timestamp
  function migrateBaseRates(
    uint256 newStepsRate,
    uint256 newMetsRate,
    uint256 originalHalvingTimestamp
  ) external onlyMigrator {
    // Only migrate if rates are zero (indicating they weren't properly migrated)
    if (baseStepsRate == 0 || baseMetsRate == 0) {
      // Set both rates to 1 token (1 * 10^18 wei)
      baseStepsRate = 1 * 10 ** 18;
      baseMetsRate = 1 * 10 ** 18;
    } else {
      baseStepsRate = newStepsRate;
      baseMetsRate = newMetsRate;
    }

    // Preserve the original halving timestamp instead of resetting to current time
    if (originalHalvingTimestamp > 0) {
      rewardHalvingTimestamp = originalHalvingTimestamp;
    } else {
      rewardHalvingTimestamp = block.timestamp;
    }

    emit RewardsRateDecreased(baseStepsRate, baseMetsRate, rewardHalvingTimestamp + 1 days);
  }

  // Function to migrate lock period multipliers
  function migrateLockPeriodMultipliers(
    uint256[] calldata months,
    uint256[] calldata multipliers
  ) external onlyMigrator {
    require(months.length == multipliers.length, 'Input arrays must have the same length');

    for (uint256 i; i < months.length; ++i) {
      lockPeriodMultipliers[months[i]] = multipliers[i];
    }
  }

  // Add pausable functionality
  function emergencyPause() external onlyOwner {
    _pause();
  }

  function emergencyUnpause() external onlyOwner {
    _unpause();
  }

  // Payable function to receive ERC20 tokens
  function deposit(uint256 amount) public payable whenNotPausedWithRevert nonReentrant {
    // Check if the amount is greater than zero
    if (amount == 0) {
      revert ZeroAmountNotAllowed();
    }

    // Check if the sender has sufficient ERC20 balance
    uint256 senderBalance = erc20MovinToken.balanceOf(msg.sender);
    if (senderBalance < amount) {
      revert InsufficientBalance(senderBalance, amount);
    }

    // Transfer ERC20 tokens from the sender to this contract
    erc20MovinToken.transferFrom(msg.sender, address(this), amount);

    // Emit an event to notify of the deposit
    emit Deposit(msg.sender, amount);
  }

  modifier whenNotPausedWithRevert() {
    if (paused()) revert ContractPaused();
    _;
  }

  function setPremiumStatus(address user, bool status) external onlyOwner {
    userActivities[user].isPremium = status;
    emit PremiumStatusChanged(user, status);
  }

  function mintToken(address to, uint256 amount) external onlyOwner {
    movinToken.mint(to, amount);
    emit Minted(to, amount);
  }

  // Owner function to update lock period multipliers
  function setLockPeriodMultiplier(uint256 months, uint256 multiplier) external onlyOwner {
    require(months > 0, 'Invalid lock period');
    lockPeriodMultipliers[months] = multiplier;
  }

  function recoverERC20(address tokenAddress) external onlyOwner {
    if (tokenAddress == address(movinToken)) revert UnauthorizedAccess();
    ERC20Upgradeable token = ERC20Upgradeable(tokenAddress);
    token.transfer(owner(), token.balanceOf(address(this)));
  }

  // V2: Owner function to verify reward rate consistency (can be called post-upgrade if needed)
  function verifyRewardRates() external view onlyOwner returns (uint256, uint256, uint256) {
    // Return current values for verification without changing them
    return (baseStepsRate, baseMetsRate, rewardHalvingTimestamp);
  }

  function getIsPremiumUser(address user) external view returns (bool) {
    return userActivities[user].isPremium;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function _checkDailyDecrease() internal {
    (uint256 newStepsRate, uint256 newMetsRate) = getBaseRates();

    if (newStepsRate != baseStepsRate || newMetsRate != baseMetsRate) {
      baseStepsRate = newStepsRate;
      baseMetsRate = newMetsRate;
      rewardHalvingTimestamp = block.timestamp;

      emit RewardsRateDecreased(baseStepsRate, baseMetsRate, rewardHalvingTimestamp + 1 days);
    }
  }

  function _removeStake(address user, uint256 index) internal {
    if (index >= userStakes[user].length) {
      revert InvalidStakeIndex(index, userStakes[user].length - 1);
    }

    // Efficient array deletion without preserving order
    if (index != userStakes[user].length - 1) {
      userStakes[user][index] = userStakes[user][userStakes[user].length - 1];
    }

    userStakes[user].pop();
  }

  function _distributeTokens(address to, uint256 amount, bool shouldMint) internal {
    if (amount == 0) return;

    uint256 contractBalance = movinToken.balanceOf(address(this));
    uint256 remainingSupply = movinToken.MAX_SUPPLY() - movinToken.totalSupply();

    if (shouldMint && remainingSupply >= amount) {
      movinToken.mint(to, amount);
    } else if (contractBalance >= amount) {
      erc20MovinToken.transfer(to, amount);
    } else {
      revert InsufficientBalance(contractBalance, amount);
    }
  }
}
