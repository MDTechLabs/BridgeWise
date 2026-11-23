// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BridgeAdapterApprovalGuard
/// @notice Enforces exact-on-demand token approvals, safe zero-resets, cumulative budgets,
///         post-call zero allowance sweeps, and emergency revocation to prevent arbitrary approval growth.
/// @dev Satisfies invariants A-1, A-2, A-3, A-4, A-5, A-10 of the BridgeWise token adapter risk specification.
contract BridgeAdapterApprovalGuard is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ADAPTER_ROLE = keccak256("ADAPTER_ROLE");

    // =============================================================
    //                           ERRORS
    // =============================================================

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsSingleApprovalLimit(address token, address spender, uint256 amount, uint256 limit);
    error ExceedsCumulativeAllowanceCap(address token, address spender, uint256 proposedTotal, uint256 cap);
    error ResetAllowanceFailed(address token, address spender);
    error SetAllowanceFailed(address token, address spender);

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Maximum allowed approval in a single transaction per (token, spender). Zero means unlimited.
    mapping(address => mapping(address => uint256)) public maxSingleApprovalLimit;

    /// @notice Cumulative lifetime allowance cap per (token, spender). Zero means unlimited.
    mapping(address => mapping(address => uint256)) public cumulativeAllowanceCap;

    /// @notice Cumulative allowance granted over lifetime per (token, spender).
    mapping(address => mapping(address => uint256)) public cumulativeAllowanceGranted;

    // =============================================================
    //                            EVENTS
    // =============================================================

    event ApprovalGranted(address indexed token, address indexed spender, uint256 amount);
    event AllowanceSwept(address indexed token, address indexed spender);
    event EmergencyAllowanceRevoked(address indexed token, address indexed spender, address indexed caller);
    event ApprovalCapsConfigured(address indexed token, address indexed spender, uint256 singleLimit, uint256 cumulativeCap);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address admin, address guardian) {
        if (admin == address(0) || guardian == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(ADAPTER_ROLE, admin);
    }

    // =============================================================
    //                      ADMIN CONFIGURATION
    // =============================================================

    function configureCaps(
        address token,
        address spender,
        uint256 singleLimit,
        uint256 cumulativeCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0) || spender == address(0)) revert ZeroAddress();
        maxSingleApprovalLimit[token][spender] = singleLimit;
        cumulativeAllowanceCap[token][spender] = cumulativeCap;
        emit ApprovalCapsConfigured(token, spender, singleLimit, cumulativeCap);
    }

    // =============================================================
    //                      APPROVAL MANAGEMENT
    // =============================================================

    /// @notice Grant exact-on-demand allowance to an authorized spender.
    /// @dev Implements A-1 (exact allowance), A-2 (safe reset-before-set), A-3 (limits).
    function grantExactApproval(
        IERC20 token,
        address spender,
        uint256 amount
    ) external onlyRole(ADAPTER_ROLE) {
        if (address(token) == address(0) || spender == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        address tokenAddr = address(token);

        // A-3: Check single-tx limit
        uint256 singleLimit = maxSingleApprovalLimit[tokenAddr][spender];
        if (singleLimit != 0 && amount > singleLimit) {
            revert ExceedsSingleApprovalLimit(tokenAddr, spender, amount, singleLimit);
        }

        // A-3: Check cumulative cap
        uint256 cap = cumulativeAllowanceCap[tokenAddr][spender];
        uint256 newCumulative = cumulativeAllowanceGranted[tokenAddr][spender] + amount;
        if (cap != 0 && newCumulative > cap) {
            revert ExceedsCumulativeAllowanceCap(tokenAddr, spender, newCumulative, cap);
        }

        // A-2: Safe reset to 0 before setting new value if current allowance > 0
        if (token.allowance(address(this), spender) != 0) {
            if (!token.approve(spender, 0)) {
                revert ResetAllowanceFailed(tokenAddr, spender);
            }
        }

        // A-1: Grant exact amount
        if (!token.approve(spender, amount)) {
            revert SetAllowanceFailed(tokenAddr, spender);
        }

        cumulativeAllowanceGranted[tokenAddr][spender] = newCumulative;
        emit ApprovalGranted(tokenAddr, spender, amount);
    }

    /// @notice Sweeps any leftover allowance back to zero post-transfer.
    /// @dev Implements A-4 (zero allowance sweep).
    function sweepAllowanceToZero(
        IERC20 token,
        address spender
    ) external onlyRole(ADAPTER_ROLE) {
        address tokenAddr = address(token);
        if (token.allowance(address(this), spender) != 0) {
            if (!token.approve(spender, 0)) {
                revert ResetAllowanceFailed(tokenAddr, spender);
            }
            emit AllowanceSwept(tokenAddr, spender);
        }
    }

    /// @notice Emergency revocation of allowance to zero.
    /// @dev Implements A-5 (emergency revocation).
    function emergencyRevokeAll(
        IERC20 token,
        address spender
    ) external {
        if (!hasRole(GUARDIAN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, GUARDIAN_ROLE);
        }

        address tokenAddr = address(token);
        if (token.allowance(address(this), spender) != 0) {
            token.approve(spender, 0);
        }
        emit EmergencyAllowanceRevoked(tokenAddr, spender, msg.sender);
    }
}
