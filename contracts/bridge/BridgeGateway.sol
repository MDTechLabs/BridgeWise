
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IBridgeVault
/// @notice Interface for the vault responsible for recording bridge locks.
interface IBridgeVault {
    /// @notice Records a token lock for a destination-chain recipient.
    /// @param destinationChainId Destination chain identifier.
    /// @param token Token that was deposited.
    /// @param amount Amount of tokens deposited.
    /// @param recipient Destination-chain recipient encoded as bytes32.
    function lock(
        uint32 destinationChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external;
}

/// @title BridgeGateway
/// @notice Source-chain entry point for single-token bridge deposits.
/// @dev Transfers tokens directly from the depositor to the configured vault,
///      then instructs the vault to record the corresponding lock.
///
/// Deposits can optionally be bounded by a configurable per-token maximum.
/// A limit of zero means that no per-deposit limit is enforced.
contract BridgeGateway is AccessControl {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           ERRORS
    // =============================================================

    error ZeroAddress();
    error ZeroAmount();
    error DepositExceedsLimit(uint256 amount, uint256 limit);

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Vault that receives deposited tokens and records bridge locks.
    /// @dev Immutable because changing the vault would change the destination
    ///      of user funds and the contract's trusted bridge endpoint.
    address public immutable vault;

    /// @notice Maximum amount of a token that can be deposited in one transaction.
    /// @dev A value of zero disables the per-deposit limit for that token.
    mapping(address token => uint256 limit) public maxDepositLimit;

    // =============================================================
    //                            EVENTS
    // =============================================================

    /// @notice Emitted when the maximum deposit limit for a token changes.
    event MaxDepositLimitSet(
        address indexed token,
        uint256 amount
    );

    /// @notice Emitted after a deposit has been transferred and locked.
    event DepositLocked(
        address indexed token,
        address indexed sender,
        uint256 amount,
        uint32 destinationChainId,
        bytes32 recipient
    );

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /// @param _vault Address of the bridge vault.
    /// @param admin Address receiving the default admin role.
    constructor(address _vault, address admin) {
        if (_vault == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }

        vault = _vault;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /// @notice Configure the maximum amount of a token allowed per deposit.
    /// @param token ERC20 token address.
    /// @param amount Maximum deposit amount. Zero disables the limit.
    function setMaxDepositLimit(
        address token,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) {
            revert ZeroAddress();
        }

        maxDepositLimit[token] = amount;

        emit MaxDepositLimitSet(token, amount);
    }

    // =============================================================
    //                       USER FUNCTIONS
    // =============================================================

    /// @notice Deposits tokens into the bridge vault and records a lock.
    /// @dev The caller must approve this contract to spend `amount` tokens
    ///      before calling this function.
    ///
    /// The token transfer is executed before `vault.lock()`. If the vault
    /// call reverts, the entire transaction reverts and the token transfer
    /// is also rolled back.
    ///
    /// @param token ERC20 token to deposit.
    /// @param amount Amount of tokens to deposit.
    /// @param destinationChainId Destination chain identifier.
    /// @param recipient Destination-chain recipient encoded as bytes32.
    function deposit(
        address token,
        uint256 amount,
        uint32 destinationChainId,
        bytes32 recipient
    ) external {
        if (token == address(0)) {
            revert ZeroAddress();
        }

        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 limit = maxDepositLimit[token];

        if (limit != 0 && amount > limit) {
            revert DepositExceedsLimit(amount, limit);
        }

        IERC20(token).safeTransferFrom(
            msg.sender,
            vault,
            amount
        );

        IBridgeVault(vault).lock(
            destinationChainId,
            token,
            amount,
            recipient
        );

        emit DepositLocked(
            token,
            msg.sender,
            amount,
            destinationChainId,
            recipient
        );
    }
}
