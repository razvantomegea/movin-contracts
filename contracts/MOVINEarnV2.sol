// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "./MovinToken.sol";

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
        uint256 lastMidnightReset;
        uint256 lastRewardAccumulationTime;
        bool isPremium;
    }
    struct ReferralInfo {
        address referrer;
        uint256 earnedBonus;
        uint256 referralCount;
    }

    event Staked(
        address indexed user,
        uint256 amount,
        uint256 lockPeriod,
        uint256 stakeIndex
    );
    event StakingRewardsClaimed(
        address indexed user,
        uint256 stakeIndex,
        uint256 reward,
        uint256 burned
    );
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
    event RewardsAccumulated(
        address indexed user,
        uint256 stepsReward,
        uint256 metsReward
    );
    event Deposit(address indexed sender, uint256 amount);

    event ReferralRegistered(address indexed user, address indexed referrer);
    event ReferralBonusPaid(
        address indexed referrer,
        address indexed referee,
        uint256 amount
    );
    event ActivityReferralBonusEarned(
        address indexed referrer,
        address indexed user,
        uint256 stepsBonus,
        uint256 metsBonus
    );

    event AllStakingRewardsClaimed(
        address indexed user,
        uint256 totalReward,
        uint256 totalBurned,
        uint256 stakeCount
    );

    // V2: Event for bulk data migration
    event UserDataMigrated(address indexed user, bool success);
    event BulkMigrationCompleted(uint256 totalUsers, uint256 successCount);

    mapping(uint256 => uint256) public lockPeriodMultipliers;
    mapping(address => Stake[]) public userStakes;
    mapping(address => UserActivity) public userActivities;

    uint256 public constant STEPS_THRESHOLD = 10_000;
    uint256 public constant METS_THRESHOLD = 10;
    uint256 public rewardHalvingTimestamp;
    uint256 public baseStepsRate;
    uint256 public baseMetsRate;
    uint256 public constant MAX_DAILY_STEPS = 25_000;
    uint256 public constant MAX_DAILY_METS = 50;
    uint256 public constant REWARDS_BURN_FEES_PERCENT = 1;
    uint256 public constant ACTIVITY_REFERRAL_BONUS_PERCENT = 1; // 1% of referee's activity points

    address public migrator;

    // V2: New mappings - added at the end of the storage layout
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
        rewardHalvingTimestamp = (block.timestamp / 86400) * 86400; // Set to current day's midnight
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
        // Reset rewardHalvingTimestamp to current midnight to start the daily decrease
        rewardHalvingTimestamp = (block.timestamp / 86400) * 86400;
    }

    modifier onlyMigrator() {
        require(msg.sender == migrator, "Caller is not migrator");
        _;
    }

    modifier whenNotPausedWithRevert() {
        if (paused()) revert ContractPaused();
        _;
    }

    function initializeMigration(address _migrator) external onlyOwner {
        require(migrator == address(0), "Migration already initialized");
        migrator = _migrator;
    }

    function getIsPremiumUser(address user) public view returns (bool) {
        return userActivities[user].isPremium;
    }

    function importStakes(
        address user,
        Stake[] calldata stakes
    ) external onlyMigrator {
        for (uint256 i = 0; i < stakes.length; i++) {
            userStakes[user].push(stakes[i]);
        }
    }

    function importActivityData(
        address user,
        uint256 steps,
        uint256 mets,
        uint256 lastReset
    ) external onlyMigrator {
        UserActivity storage activity = userActivities[user];
        activity.dailySteps = steps;
        activity.dailyMets = mets;
        activity.lastMidnightReset = lastReset;
    }

    function importRewardData(
        address user,
        uint256 stepsReward,
        uint256 metsReward
    ) external onlyMigrator {
        UserActivity storage activity = userActivities[user];
        activity.pendingStepsRewards = stepsReward;
        activity.pendingMetsRewards = metsReward;
    }

    function importPremiumStatus(
        address user,
        bool status
    ) external onlyMigrator {
        userActivities[user].isPremium = status;
    }

    // Add pausable functionality
    function emergencyPause() external onlyOwner {
        _pause();
    }

    function emergencyUnpause() external onlyOwner {
        _unpause();
    }

    // Payable function to receive ERC20 tokens
    function deposit(
        uint256 amount
    ) public payable whenNotPausedWithRevert nonReentrant {
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

    // Combined getter for user activity
    function getUserActivity()
        public
        view
        returns (uint256 steps, uint256 mets)
    {
        uint256 currentMidnight = (block.timestamp / 86400) * 86400;
        UserActivity memory activity = userActivities[msg.sender];

        if (activity.lastMidnightReset < currentMidnight) {
            return (0, 0);
        }

        return (activity.dailySteps, activity.dailyMets);
    }

    // Combined getter for both rewards
    function getPendingRewards()
        public
        view
        returns (uint256 stepsReward, uint256 metsReward)
    {
        UserActivity memory activity = userActivities[msg.sender];
        return (activity.pendingStepsRewards, activity.pendingMetsRewards);
    }

    function stakeTokens(
        uint256 amount,
        uint256 lockMonths
    ) external nonReentrant whenNotPausedWithRevert {
        if (amount == 0) revert ZeroAmountNotAllowed();
        if (lockPeriodMultipliers[lockMonths] == 0)
            revert InvalidLockPeriod(lockMonths);

        uint256 userBalance = movinToken.balanceOf(msg.sender);
        if (userBalance < amount)
            revert InsufficientBalance(userBalance, amount);

        uint256 allowance = movinToken.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientAllowance(allowance, amount);
        }

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

        emit Staked(
            msg.sender,
            amount,
            lockPeriod,
            userStakes[msg.sender].length - 1
        );
    }

    function claimStakingRewards(
        uint256 stakeIndex
    ) external nonReentrant whenNotPausedWithRevert {
        uint256 stakeCount = getUserStakeCount();

        if (stakeIndex >= stakeCount) {
            revert InvalidStakeIndex(stakeIndex, stakeCount - 1);
        }

        uint256 reward = calculateStakingReward(stakeIndex);
        // Add minimum threshold of 1 finney (0.001 ether) to prevent claiming tiny amounts
        if (reward == 0 || reward < 0.001 ether) revert NoRewardsAvailable();

        if (movinToken.balanceOf(address(this)) < reward) {
            revert InsufficientBalance(
                movinToken.balanceOf(address(this)),
                reward
            );
        }

        userStakes[msg.sender][stakeIndex].lastClaimed = block.timestamp;
        uint256 burnAmount = (reward * REWARDS_BURN_FEES_PERCENT) / 100;
        uint256 userReward = reward - burnAmount;

        erc20MovinToken.transfer(msg.sender, userReward);
        movinToken.burn(burnAmount);

        emit StakingRewardsClaimed(
            msg.sender,
            stakeIndex,
            userReward,
            burnAmount
        );
    }

    /**
     * @dev Claims staking rewards from all active stakes in one transaction
     * Aggregates rewards from all stakes, applies burn fee once, and transfers total to user
     */
    function claimAllStakingRewards()
        external
        nonReentrant
        whenNotPausedWithRevert
    {
        uint256 stakeCount = getUserStakeCount();
        if (stakeCount == 0) revert NoRewardsAvailable();

        // First pass: calculate total rewards and identify stakes with rewards
        uint256 totalReward = 0;
        bool hasRewards = false;

        for (uint256 i = 0; i < stakeCount; i++) {
            uint256 reward = calculateStakingReward(i);
            if (reward > 0) {
                totalReward += reward;
                hasRewards = true;
            }
        }

        // Explicit check for rewards availability
        // Add minimum threshold of 1 finney (0.001 ether) to prevent claiming tiny amounts
        if (!hasRewards || totalReward == 0 || totalReward < 0.001 ether)
            revert NoRewardsAvailable();

        // Check if contract has enough balance
        if (movinToken.balanceOf(address(this)) < totalReward) {
            revert InsufficientBalance(
                movinToken.balanceOf(address(this)),
                totalReward
            );
        }

        // Update lastClaimed timestamps for all stakes with rewards
        for (uint256 i = 0; i < stakeCount; i++) {
            if (calculateStakingReward(i) > 0) {
                userStakes[msg.sender][i].lastClaimed = block.timestamp;
            }
        }

        // Calculate burn amount and user reward
        uint256 burnAmount = (totalReward * REWARDS_BURN_FEES_PERCENT) / 100;
        uint256 userReward = totalReward - burnAmount;

        // Transfer tokens to user
        erc20MovinToken.transfer(msg.sender, userReward);

        // Burn specified amount
        movinToken.burn(burnAmount);

        // Emit event
        emit AllStakingRewardsClaimed(
            msg.sender,
            userReward,
            burnAmount,
            stakeCount
        );
    }

    function unstake(
        uint256 stakeIndex
    ) external nonReentrant whenNotPausedWithRevert {
        uint256 stakeCount = getUserStakeCount();

        if (stakeIndex >= stakeCount)
            revert InvalidStakeIndex(stakeIndex, stakeCount - 1);

        Stake memory stake = getUserStake(stakeIndex);
        uint256 unlockTime = stake.startTime + stake.lockDuration;

        // Check if the lock period is still active
        if (block.timestamp < unlockTime) {
            revert LockPeriodActive(unlockTime);
        }

        _removeStake(msg.sender, stakeIndex);
        uint256 burnAmount = (stake.amount * REWARDS_BURN_FEES_PERCENT) / 100;
        uint256 userPayout = stake.amount - burnAmount;
        erc20MovinToken.transfer(msg.sender, userPayout);
        movinToken.burn(burnAmount);

        emit Unstaked(msg.sender, stake.amount, stakeIndex);
    }

    function registerReferral(
        address referrer
    ) external whenNotPausedWithRevert {
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
    )
        external
        view
        returns (address referrer, uint256 earnedBonus, uint256 referralCount)
    {
        ReferralInfo memory info = userReferrals[user];
        return (info.referrer, info.earnedBonus, info.referralCount);
    }

    // V2: New function to get all referrals of a user
    function getUserReferrals(
        address user
    ) external view returns (address[] memory) {
        return referrals[user];
    }

    function recordActivity(
        uint256 newSteps,
        uint256 newMets
    ) external whenNotPausedWithRevert {
        if (newSteps > MAX_DAILY_STEPS || newMets > MAX_DAILY_METS) {
            revert InvalidActivityInput();
        }

        uint256 currentMidnight = (block.timestamp / 86400) * 86400;
        UserActivity storage activity = userActivities[msg.sender];

        // Check if we need to reset for the new day
        if (activity.lastMidnightReset < currentMidnight) {
            activity.dailySteps = 0;
            activity.dailyMets = 0;
        }

        activity.lastMidnightReset = currentMidnight;

        // Apply referral bonus to steps and mets
        address referrer = userReferrals[msg.sender].referrer;
        uint256 stepsBonus = 0;
        uint256 metsBonus = 0;

        if (referrer != address(0)) {
            stepsBonus = (newSteps * ACTIVITY_REFERRAL_BONUS_PERCENT) / 100;
            metsBonus = (newMets * ACTIVITY_REFERRAL_BONUS_PERCENT) / 100;

            // Award bonus to referrer's activity
            UserActivity storage referrerActivity = userActivities[referrer];

            // Check if the referrer needs a daily reset too
            if (referrerActivity.lastMidnightReset < currentMidnight) {
                referrerActivity.dailySteps = 0;
                referrerActivity.dailyMets = 0;
                referrerActivity.lastMidnightReset = currentMidnight;
            }

            // Add bonus steps
            referrerActivity.dailySteps += stepsBonus;

            // Only add mets bonus if referrer is premium
            if (referrerActivity.isPremium) {
                referrerActivity.dailyMets += metsBonus;
            }

            // Cap at maximum daily values
            if (referrerActivity.dailySteps > MAX_DAILY_STEPS) {
                referrerActivity.dailySteps = MAX_DAILY_STEPS;
            }

            if (referrerActivity.dailyMets > MAX_DAILY_METS) {
                referrerActivity.dailyMets = MAX_DAILY_METS;
            }

            // Emit event for the referral bonus
            emit ActivityReferralBonusEarned(
                referrer,
                msg.sender,
                stepsBonus,
                metsBonus
            );
        }

        // Update activity data
        activity.dailySteps += newSteps;

        // Only update mets for premium users
        if (activity.isPremium) {
            activity.dailyMets += newMets;
        }

        _checkDailyDecrease();

        uint256 stepsReward = 0;
        if (activity.dailySteps >= STEPS_THRESHOLD) {
            stepsReward =
                (activity.dailySteps / STEPS_THRESHOLD) *
                baseStepsRate;
            activity.pendingStepsRewards = stepsReward;
        }

        uint256 metsReward = 0;
        if (activity.isPremium && activity.dailyMets >= METS_THRESHOLD) {
            metsReward = (activity.dailyMets / METS_THRESHOLD) * baseMetsRate;
            activity.pendingMetsRewards = metsReward;
        }

        emit ActivityRecorded(
            msg.sender,
            newSteps,
            newMets,
            activity.dailySteps,
            activity.dailyMets,
            block.timestamp
        );

        if (stepsReward > 0 || metsReward > 0) {
            activity.lastRewardAccumulationTime = block.timestamp;
            emit RewardsAccumulated(msg.sender, stepsReward, metsReward);
        }
    }

    function calculateStakingReward(
        uint256 stakeIndex
    ) public view returns (uint256) {
        Stake memory stake = getUserStake(stakeIndex);
        uint256 lockMonths = stake.lockDuration / 30 days;
        uint256 apr = lockPeriodMultipliers[lockMonths];
        uint256 stakedDuration = block.timestamp - stake.lastClaimed;

        // Calculate reward: (amount * apr * effectiveDuration) / (100 * 365 days)
        // The division by 100 converts apr from percentage to decimal
        // The division by 365 days is because APR is annual
        uint256 reward = (stake.amount * apr * stakedDuration) /
            (100 * 365 days);

        return reward;
    }

    function getUserStakes(address user) public view returns (Stake[] memory) {
        return userStakes[user];
    }

    function getUserStake(uint256 index) public view returns (Stake memory) {
        if (index >= userStakes[msg.sender].length) {
            revert InvalidStakeIndex(index, userStakes[msg.sender].length - 1);
        }

        return userStakes[msg.sender][index];
    }

    function getUserStakeCount() public view returns (uint256) {
        return userStakes[msg.sender].length;
    }

    function claimRewards() external nonReentrant whenNotPausedWithRevert {
        _checkDailyDecrease();

        UserActivity storage activity = userActivities[msg.sender];

        if (block.timestamp > activity.lastRewardAccumulationTime + 30 days) {
            // Reset rewards if expired
            activity.pendingStepsRewards = 0;
            activity.pendingMetsRewards = 0;
            activity.dailySteps = 0;
            activity.dailyMets = 0;

            revert RewardsExpired();
        }

        // Get pending rewards
        uint256 totalStepsReward = activity.pendingStepsRewards;
        uint256 totalMetsReward = activity.pendingMetsRewards;
        uint256 totalReward = totalStepsReward + totalMetsReward;

        if (totalReward == 0) revert NoRewardsAvailable();
        if (movinToken.balanceOf(address(this)) < totalReward) {
            revert InsufficientBalance(
                movinToken.balanceOf(address(this)),
                totalReward
            );
        }

        // Reset rewards
        activity.pendingStepsRewards = 0;
        activity.pendingMetsRewards = 0;

        uint256 burnAmount = (totalReward * REWARDS_BURN_FEES_PERCENT) / 100;
        uint256 reward = totalReward - burnAmount;

        erc20MovinToken.transfer(msg.sender, reward);
        movinToken.burn(burnAmount);

        emit RewardsClaimed(
            msg.sender,
            totalStepsReward,
            totalMetsReward,
            reward
        );
    }

    function setPremiumStatus(address user, bool status) external onlyOwner {
        userActivities[user].isPremium = status;
        emit PremiumStatusChanged(user, status);
    }

    // Owner function to update lock period multipliers
    function setLockPeriodMultiplier(
        uint256 months,
        uint256 multiplier
    ) external onlyOwner {
        require(months > 0, "Invalid lock period");
        lockPeriodMultipliers[months] = multiplier;
    }

    function _checkDailyDecrease() internal {
        uint256 currentMidnight = (block.timestamp / 86400) * 86400;

        if (currentMidnight > rewardHalvingTimestamp) {
            // Calculate number of days passed since last decrease
            uint256 daysPassed = (currentMidnight - rewardHalvingTimestamp) /
                86400;

            // Apply 1% decrease for each day
            for (uint256 i = 0; i < daysPassed; i++) {
                baseStepsRate = (baseStepsRate * 99) / 100; // Decrease by 1%
                baseMetsRate = (baseMetsRate * 99) / 100; // Decrease by 1%
            }

            // Update the last decrease timestamp
            rewardHalvingTimestamp = currentMidnight;

            emit RewardsRateDecreased(
                baseStepsRate,
                baseMetsRate,
                rewardHalvingTimestamp + 1 days
            );
        }
    }

    function _removeStake(address user, uint256 index) internal {
        if (index >= userStakes[user].length)
            revert InvalidStakeIndex(index, userStakes[user].length - 1);
        userStakes[user][index] = userStakes[user][userStakes[user].length - 1];
        userStakes[user].pop();
    }

    function recoverERC20(address tokenAddress) external onlyOwner {
        if (tokenAddress == address(movinToken)) revert UnauthorizedAccess();
        ERC20Upgradeable token = ERC20Upgradeable(tokenAddress);
        token.transfer(owner(), token.balanceOf(address(this)));
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

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
        if (
            activity.lastRewardAccumulationTime == 0 &&
            (activity.pendingStepsRewards > 0 ||
                activity.pendingMetsRewards > 0)
        ) {
            // Fix missing timestamp for pending rewards
            activity.lastRewardAccumulationTime = block.timestamp;
        }

        // Reset daily activity if it's from a previous day
        uint256 currentMidnight = (block.timestamp / 86400) * 86400;
        if (activity.lastMidnightReset < currentMidnight) {
            activity.dailySteps = 0;
            activity.dailyMets = 0;
            activity.lastMidnightReset = currentMidnight;
        }
        activityMigrated = true;

        // Migrate referral data
        ReferralInfo storage referralInfo = userReferrals[user];

        // Check if user has referrals but no count is recorded
        address[] storage currentUserReferrals = referrals[user];
        if (
            currentUserReferrals.length > 0 && referralInfo.referralCount == 0
        ) {
            referralInfo.referralCount = currentUserReferrals.length;
        }
        referralMigrated = true;

        // Emit success only if all components were migrated successfully
        if (stakesMigrated && activityMigrated && referralMigrated) {
            emit UserDataMigrated(user, true);
        } else {
            emit UserDataMigrated(user, false);
            revert("Migration failed");
        }
    }
}
