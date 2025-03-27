// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @custom:security-contact security@example.com
contract MovinTokenV2 is
    Initializable,
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    error ExceedsMaxSupply(uint256 requested, uint256 available);
    error ZeroAmountNotAllowed();
    error InsufficientAllowance(uint256 allowed, uint256 required);
    error InvalidAddress();
    error TokensAreLocked(uint256 unlockTime);
    error InvalidLockDuration();

    uint256 public constant MAX_SUPPLY = 1_000_000_000_000 * 10 ** 18; // 1 trillion

    // New V2 variables
    mapping(address => uint256) public lockedUntil;

    // V2 events
    event TokensLocked(address indexed user, uint256 unlockTime);
    event TokensUnlocked(address indexed user);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __ERC20_init("Movin", "MVN");
        __ERC20Pausable_init();
        __ERC20Burnable_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        // Mint initial supply to the owner
        _mint(initialOwner, 11_000_000_000 * 10 ** decimals());
    }

    // Original functions
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function mint(address to, uint256 amount) public onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert ZeroAmountNotAllowed();

        uint256 newSupply = totalSupply() + amount;
        if (newSupply > MAX_SUPPLY) {
            revert ExceedsMaxSupply(amount, MAX_SUPPLY - totalSupply());
        }

        _mint(to, amount);
    }

    // New V2 functions

    /**
     * @dev Locks tokens for a specified duration
     * @param duration Number of seconds to lock tokens
     */
    function lockTokens(uint256 duration) public {
        if (duration == 0) revert InvalidLockDuration();

        uint256 unlockTime = block.timestamp + duration;
        lockedUntil[msg.sender] = unlockTime;

        emit TokensLocked(msg.sender, unlockTime);
    }

    /**
     * @dev Unlocks tokens if the lock period has expired
     */
    function unlockTokens() public {
        if (lockedUntil[msg.sender] > block.timestamp) {
            revert TokensAreLocked(lockedUntil[msg.sender]);
        }

        lockedUntil[msg.sender] = 0;
        emit TokensUnlocked(msg.sender);
    }

    /**
     * @dev Returns the unlock time for a given account
     * @param account The address to check
     * @return The timestamp when tokens will be unlocked (0 if not locked)
     */
    function getUnlockTime(address account) public view returns (uint256) {
        return lockedUntil[account];
    }

    /**
     * @dev Returns whether tokens are locked for a given account
     * @param account The address to check
     * @return True if tokens are locked, false otherwise
     */
    function isLocked(address account) public view returns (bool) {
        return lockedUntil[account] > block.timestamp;
    }

    // Override transfer functions to check for locked tokens
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // Check if sender's tokens are locked (except for burning)
        if (
            from != address(0) &&
            to != address(0) &&
            lockedUntil[from] > block.timestamp
        ) {
            revert TokensAreLocked(lockedUntil[from]);
        }

        super._update(from, to, value);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
