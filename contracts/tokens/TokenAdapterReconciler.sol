// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TokenAdapterReconciler
/// @notice Reconciles inbound balance deltas for Fee-on-Transfer (FoT) tokens and protects
///         against malicious callback reentrancy (ERC-777, ERC-1363, fallback attacks).
/// @dev Implements invariants A-6, A-7, A-8, A-9 of the BridgeWise token adapter risk specification.
contract TokenAdapterReconciler is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // =============================================================
    //                           ERRORS
    // =============================================================

    error ZeroAddress();
    error ZeroAmount();
    error ZeroDelta();
    error SubMinimumDelta(uint256 delta, uint256 minExpected);
    error RebaseShortfall(address token, uint256 physicalBalance, uint256 recordedLiabilities);

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Total recorded liabilities per token
    mapping(address => uint256) public recordedLiabilities;

    // =============================================================
    //                            EVENTS
    // =============================================================

    event DepositReconciled(
        address indexed token,
        address indexed sender,
        uint256 nominalAmount,
        uint256 creditedDelta,
        bytes32 messageId
    );

    event RebaseReconciled(
        address indexed token,
        uint256 physicalBalance,
        uint256 recordedLiabilities,
        int256 drift
    );

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // =============================================================
    //                  RECONCILIATION & EXECUTION
    // =============================================================

    /// @notice Transfers tokens from sender, measuring actual balance delta before & after.
    /// @dev Implements A-6 (reentrancy protection), A-7 (actual delta), A-8 (zero/sub-min check).
    function reconcileInboundTransfer(
        IERC20 token,
        address from,
        uint256 nominalAmount,
        uint256 minExpectedDelta,
        bytes32 messageId
    ) external nonReentrant returns (uint256 delta) {
        if (address(token) == address(0) || from == address(0)) revert ZeroAddress();
        if (nominalAmount == 0) revert ZeroAmount();

        uint256 beforeBalance = token.balanceOf(address(this));

        // Interaction with potentially malicious callback token
        token.safeTransferFrom(from, address(this), nominalAmount);

        uint256 afterBalance = token.balanceOf(address(this));
        delta = afterBalance - beforeBalance;

        // A-8: Zero delta check
        if (delta == 0) revert ZeroDelta();

        // A-8: Sub-minimum delta check
        if (delta < minExpectedDelta) revert SubMinimumDelta(delta, minExpectedDelta);

        // Update accounting liabilities
        recordedLiabilities[address(token)] += delta;

        emit DepositReconciled(
            address(token),
            from,
            nominalAmount,
            delta,
            messageId
        );

        return delta;
    }

    /// @notice Verifies and reconciles rebasing token balance drift against recorded liabilities.
    /// @dev Implements A-9 (rebasing solvency invariant).
    function reconcileRebaseDrift(IERC20 token) external view returns (int256 drift) {
        address tokenAddr = address(token);
        uint256 physical = token.balanceOf(address(this));
        uint256 liabilities = recordedLiabilities[tokenAddr];

        if (physical < liabilities) {
            revert RebaseShortfall(tokenAddr, physical, liabilities);
        }

        drift = int256(physical) - int256(liabilities);
        return drift;
    }
}
