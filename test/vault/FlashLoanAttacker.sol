// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashLoanGuardVault} from "../../contracts/vault/FlashLoanGuardVault.sol";

/// @title FlashLoanAttacker
/// @notice Test double that deposits into and immediately withdraws from a
///         FlashLoanGuardVault within a single transaction, simulating a
///         flash-loan-funded actor that borrows, deposits, and withdraws
///         atomically to try to skew the share price in one block.
contract FlashLoanAttacker {
    /// @notice Deposit `amount` into `vault` and withdraw all resulting
    ///         shares in the same call.
    function attack(FlashLoanGuardVault vault, IERC20 asset, uint256 amount) external {
        asset.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount);
        vault.withdraw(shares);
    }
}
