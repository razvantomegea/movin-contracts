// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @custom:security-contact security@example.com
contract MovinToken is
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
    uint256 public constant MAX_SUPPLY = 1_000_000_000_000 * 10 ** 18; // 1 trillion

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

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // The following functions are overrides required by Solidity
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, value);
    }
}
