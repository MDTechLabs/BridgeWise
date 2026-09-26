// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BridgeWrappedToken
/// @notice Standardized ERC-20 for bridged assets (e.g. bwUSDC, bwETH). Minting
///         and privileged burning are restricted to the Bridge Vault contract:
///         the vault mints synthetic assets upon lock verification on the
///         destination chain, and burns them prior to release on the source chain.
/// @dev Uses OpenZeppelin v5 `AccessControl`; unauthorized callers to `mint`
///      or `burnFrom` revert with `AccessControlUnauthorizedAccount`.
contract BridgeWrappedToken is ERC20, ERC20Burnable, AccessControl {
    /// @notice Role allowed to mint new wrapped supply.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @notice Role allowed to burn supply from arbitrary holders via `burnFrom`.
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @param name_ ERC-20 name (e.g. "Bridged USDC").
    /// @param symbol_ ERC-20 symbol (e.g. "bwUSDC").
    /// @param bridgeVault Address of the Bridge Vault contract granted mint/burn rights.
    /// @param admin Address granted `DEFAULT_ADMIN_ROLE` for future role management.
    constructor(
        string memory name_,
        string memory symbol_,
        address bridgeVault,
        address admin
    ) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, bridgeVault);
        _grantRole(BURNER_ROLE, bridgeVault);
    }

    /// @notice Mint `amount` of wrapped tokens to `to`. Restricted to `MINTER_ROLE`.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burn `amount` from `account` (subject to allowance). Restricted to
    ///         `BURNER_ROLE` so only the bridge can burn on release execution.
    /// @dev Overrides `ERC20Burnable.burnFrom` to add the role gate while keeping
    ///      the standard allowance accounting from the parent implementation.
    function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
        super.burnFrom(account, amount);
    }
}
