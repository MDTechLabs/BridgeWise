// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IReserveVault
/// @notice Minimal interface for vaults that report per-token locked reserves.
interface IReserveVault {
    /// @notice Total reserves locked for `token`.
    function lockedReserves(address token) external view returns (uint256);
}

/// @title VaultHealthEvaluator
/// @notice On-chain solvency calculator that compares locked reserves against
///         outstanding wrapped token supply.
contract VaultHealthEvaluator {
    /// @notice Health status tiers expressed in basis points.
    /// @dev Ratio = (TotalLockedReserves * 10_000) / TotalMintedWrapped.
    enum HealthStatus {
        SOLVENT,
        UNDERCOLLATERALIZED,
        CRITICAL
    }

    /// @notice Basis-point denominator used for the ratio.
    uint256 public constant BPS = 10_000;

    /// @notice Ratio below which the vault is considered undercollateralized.
    uint256 public constant UNDERCOLLATERALIZED_THRESHOLD = 10_000; // 100%

    /// @notice Ratio below which the vault is considered critical.
    uint256 public constant CRITICAL_THRESHOLD = 8_000; // 80%

    /// @notice Compute the solvency ratio and health status for `wrappedToken`
    ///         using reserves tracked by `reserveVault`.
    /// @param reserveVault Vault that reports locked reserves for the token.
    /// @param wrappedToken ERC-20 wrapped asset whose total supply represents
    ///        outstanding obligations.
    /// @return ratioBps Collateralization ratio in basis points.
    /// @return status Current health status flag.
    function evaluate(
        address reserveVault,
        address wrappedToken
    ) external view returns (uint256 ratioBps, HealthStatus status) {
        uint256 totalLocked = IReserveVault(reserveVault).lockedReserves(wrappedToken);
        uint256 totalMinted = IERC20(wrappedToken).totalSupply();

        if (totalMinted == 0) {
            return (0, HealthStatus.SOLVENT);
        }

        ratioBps = (totalLocked * BPS) / totalMinted;

        if (ratioBps < CRITICAL_THRESHOLD) {
            status = HealthStatus.CRITICAL;
        } else if (ratioBps < UNDERCOLLATERALIZED_THRESHOLD) {
            status = HealthStatus.UNDERCOLLATERALIZED;
        } else {
            status = HealthStatus.SOLVENT;
        }
    }
}
