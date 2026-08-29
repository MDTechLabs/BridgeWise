// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IBridgeVault
/// @notice Minimal interface for the core bridge vault used by gateways/routers.
interface IBridgeVault {
    function lock(
        uint32 destinationChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external;
}

/// @title BridgeGateway
/// @notice Source-chain entry point for single-token bridge deposits, bounded
///         by a per-token configurable maximum deposit limit. This caps the
///         potential loss from any single malicious or anomalous operation
///         (e.g. an oracle glitch or flash-loan-funded transfer) by rejecting
///         deposits above the configured cap before they ever reach the
///         lock/burn routine on the vault.
contract BridgeGateway is AccessControl {
    using SafeERC20 for IERC20;

    /// @notice Core bridge vault that receives token deposits and performs
    ///         the lock/burn routine.
    IBridgeVault public immutable vault;

    /// @notice Per-token maximum amount allowed in a single deposit.
    /// @dev A value of `0` means "no limit configured" (unlimited), mirroring
    ///      the `DepositGuard` convention of treating zero as "unbounded"
    ///      rather than "blocked". Admins must explicitly opt a token into a
    ///      bounded cap via `setMaxDepositLimit`.
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
    /// @notice Thrown when a deposit amount exceeds the configured cap for
    ///         the token being deposited.
    error DepositExceedsLimit(uint256 amount, uint256 limit);

    constructor(address _vault, address admin) {
        if (_vault == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();
        vault = IBridgeVault(_vault);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Set (or update) the maximum single-deposit amount allowed for
    ///         a given token. Callable only by an account holding
    ///         `DEFAULT_ADMIN_ROLE`, allowing caps to be adjusted dynamically
    ///         as conditions change.
    /// @param token  ERC-20 token to bound.
    /// @param amount New maximum allowed amount per deposit; `0` disables the
    ///               cap (unlimited) for this token.
    function setMaxDepositLimit(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        maxDepositLimit[token] = amount;
        emit MaxDepositLimitSet(token, amount);
    }

    /// @notice Deposit a single ERC-20 token into the bridge vault for
    ///         cross-chain transfer, subject to the configured per-token
    ///         maximum deposit limit.
    /// @param token              ERC-20 token to bridge.
    /// @param amount             Amount to bridge.
    /// @param destinationChainId Destination chain identifier.
    /// @param recipient          32-byte normalized recipient on destination.
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

        // Pull tokens from the caller and forward directly to the vault,
        // then initiate the lock/burn routine. SafeERC20 reverts
        // automatically on transfer failures.
        IERC20(token).safeTransferFrom(msg.sender, address(vault), amount);
        vault.lock(destinationChainId, token, amount, recipient);

        emit DepositLocked(token, msg.sender, amount, destinationChainId, recipient);
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BridgeEvents} from "../events/BridgeEvents.sol";
import {BridgeWrappedToken} from "../tokens/BridgeWrappedToken.sol";

/// @title BridgeGateway
/// @notice Unified bridge gateway that routes cross-chain lock, burn, mint, and
///         unlock operations and emits standardized MessageSent / MessageDelivered
///         / MessageFailed events for consistent off-chain indexing.
/// @dev Source-chain operations (lock / burn) send tokens into the gateway and emit
///      MessageSent. Destination-chain operations (mint / unlock) release tokens
///      from the gateway and emit MessageDelivered or MessageFailed.
contract BridgeGateway is BridgeEvents {
    using SafeERC20 for IERC20;

    /// @notice Source chain identifier for this deployment.
    uint32 public immutable chainId;

    /// @notice The BridgeWrappedToken used for mint/burn flows.
    BridgeWrappedToken public immutable wrappedToken;

    /// @notice Maps destination chain → next outbound nonce.
    mapping(uint32 => uint64) public outboundNonces;

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();

    event LiquidityWithdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(uint32 _chainId, address _wrappedToken) {
        if (_wrappedToken == address(0)) revert ZeroAddress();
        chainId = _chainId;
        wrappedToken = BridgeWrappedToken(_wrappedToken);
    }

    /// @notice Lock native tokens into the gateway and emit a standardized
    ///         cross-chain MessageSent event (source-chain lock flow).
    /// @param dstChainId   Target destination chain.
    /// @param token        ERC-20 token address to lock.
    /// @param amount       Amount of tokens to lock.
    /// @param recipient    32-byte recipient identifier on destination.
    /// @return msgHash     Unique message hash.
    /// @return nonce       Assigned outbound nonce.
    function lock(
        uint32 dstChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external returns (bytes32 msgHash, uint64 nonce) {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        nonce = outboundNonces[dstChainId];
        outboundNonces[dstChainId] = nonce + 1;

        msgHash = keccak256(abi.encodePacked(chainId, dstChainId, nonce, token, amount, recipient));

        emit MessageSent(msgHash, chainId, dstChainId, nonce);
    }

    /// @notice Burn wrapped tokens and emit a standardized MessageSent event
    ///         (source-chain burn flow).
    /// @param dstChainId   Target destination chain.
    /// @param account      The holder whose wrapped tokens are burnt.
    /// @param amount       Amount of wrapped tokens to burn.
    /// @param recipient    32-byte recipient identifier on destination.
    /// @return msgHash     Unique message hash.
    /// @return nonce       Assigned outbound nonce.
    function burn(
        uint32 dstChainId,
        address account,
        uint256 amount,
        bytes32 recipient
    ) external returns (bytes32 msgHash, uint64 nonce) {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        wrappedToken.burnFrom(account, amount);

        nonce = outboundNonces[dstChainId];
        outboundNonces[dstChainId] = nonce + 1;

        msgHash = keccak256(abi.encodePacked(chainId, dstChainId, nonce, account, amount, recipient));

        emit MessageSent(msgHash, chainId, dstChainId, nonce);
    }

    /// @notice Mint wrapped tokens upon verified cross-chain message delivery
    ///         and emit a standardized MessageDelivered event (destination-chain
    ///         mint flow).
    /// @param msgHash     Unique message hash (emitted by source).
    /// @param srcChainId  Source chain identifier.
    /// @param to          Address to receive the minted wrapped tokens.
    /// @param amount      Amount of wrapped tokens to mint.
    function mint(
        bytes32 msgHash,
        uint32 srcChainId,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        wrappedToken.mint(to, amount);

        emit MessageDelivered(msgHash, srcChainId, chainId, true);
    }

    /// @notice Unlock native tokens upon verified cross-chain message delivery
    ///         and emit a standardized MessageDelivered event (destination-chain
    ///         unlock flow).
    /// @param msgHash     Unique message hash (emitted by source).
    /// @param srcChainId  Source chain identifier.
    /// @param token       ERC-20 token address to unlock.
    /// @param to          Address to receive the unlocked tokens.
    /// @param amount      Amount of tokens to unlock.
    function unlock(
        bytes32 msgHash,
        uint32 srcChainId,
        address token,
        address to,
        uint256 amount
    ) external {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);

        emit MessageDelivered(msgHash, srcChainId, chainId, true);
    }

    /// @notice Report a failed cross-chain message and emit a standardized
    ///         MessageFailed event (destination-chain fallback flow).
    /// @param msgHash     Unique message hash (emitted by source).
    /// @param srcChainId  Source chain identifier.
    /// @param recipient   The intended fallback recipient.
    /// @param token       The bridged token address.
    /// @param amount      The amount escrowed.
    function fail(
        bytes32 msgHash,
        uint32 srcChainId,
        address recipient,
        address token,
        uint256 amount
    ) external {
        if (recipient == address(0)) revert ZeroAddress();

        emit MessageFailed(msgHash, srcChainId, chainId, recipient, token, amount);
    }

    /// @notice Withdraw accidentally sent tokens from the gateway.
    function withdrawLiquidity(address token, uint256 amount, address to) external {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);
        emit LiquidityWithdrawn(token, to, amount);

    }
}
