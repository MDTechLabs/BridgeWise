// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
/// @title IBridgeVault
interface IBridgeVault {
    function lock(uint32 destinationChainId, address token, uint256 amount, bytes32 recipient) external;
}

/// @title BridgeGateway
/// @notice Source-chain entry point for single-token bridge deposits, bounded
///         by a per-token configurable maximum deposit limit.
contract BridgeGateway is AccessControl {
    using SafeERC20 for IERC20;

    /// @notice Core bridge vault that receives token deposits and performs
    ///         the lock/burn routine.
    address public immutable vault;

    /// @notice Per-token maximum amount allowed in a single deposit.
    mapping(address => uint256) public maxDepositLimit;

    event MaxDepositLimitSet(address indexed token, uint256 amount);
    event DepositLocked(
        address indexed token,
        address indexed sender,
        uint256 amount,
        uint32 destinationChainId,
        bytes32 recipient
    );

    error ZeroAddress();
    error ZeroAmount();
    error DepositExceedsLimit(uint256 amount, uint256 limit);

    constructor(address _vault, address admin) {
        if (_vault == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();
        vault = _vault;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setMaxDepositLimit(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        maxDepositLimit[token] = amount;
        emit MaxDepositLimitSet(token, amount);
    }

    function deposit(
        address token,
        uint256 amount,
        uint32 destinationChainId,
        bytes32 recipient
    ) external {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 limit = maxDepositLimit[token];
        if (limit > 0 && amount > limit) {
            revert DepositExceedsLimit(amount, limit);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(vault), amount);
        IBridgeVault(vault).lock(destinationChainId, token, amount, recipient);

        emit DepositLocked(token, msg.sender, amount, destinationChainId, recipient);
    }
}
