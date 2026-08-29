// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BridgeReceiverBase
/// @notice Base for cross-chain message receiver contracts. Integrates an
///         emergency circuit breaker so operations can be halted instantly if
///         an exploit is discovered in cross-chain messaging logic, without
///         redeploying contracts.
/// @dev Key entry points (`receiveMessage`, `withdrawLiquidity`) are gated with
///      `whenNotPaused` and delegate to internal hooks that concrete receivers
///      override. When paused, calls revert with OpenZeppelin's `EnforcedPause`.
///      `pause()` / `unpause()` are restricted to `GUARDIAN_ROLE` (intended for
///      a guardian key or Emergency Multi-Sig).
///
/// @dev EIP-712 domain spec (see docs/SIGNATURE_SPECIFICATION.md):
///      Concrete receivers overriding `_handleMessage` MUST verify the attestation
///      against the mandatory `BridgeWiseDomain` separator before acting on a payload:
///
///        BridgeWiseDomain(string name,string version,uint256 sourceChainId,
///                         uint256 targetChainId,address bridgeAddress)
///
///      `name = "BridgeWise"`, `version = "1"`, `sourceChainId` = EIP-155 ID of the
///      origin chain, `targetChainId` MUST equal `block.chainid`, and `bridgeAddress`
///      MUST equal `address(this)`. The OpenZeppelin `EIP712` base is NOT sufficient:
///      it cannot express `sourceChainId`, so the separator is built explicitly.
///
///      Note that `keccak256(message)` emitted by `MessageReceived` is a raw
///      calldata digest for indexing only — it is NOT the EIP-712 digest and MUST NOT
///      be used as the replay key. The replay key is the signed `messageId`.
contract BridgeReceiverBase is AccessControl, Pausable {
    /// @notice Role permitted to pause/unpause the contract.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    event MessageReceived(bytes32 indexed messageHash);
    event LiquidityWithdrawn(address indexed token, address indexed to, uint256 amount);

    /// @param admin Address granted `DEFAULT_ADMIN_ROLE`.
    /// @param guardian Address granted `GUARDIAN_ROLE` (guardian key / multi-sig).
    constructor(address admin, address guardian) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    /// @notice Halt all pausable operations. Restricted to `GUARDIAN_ROLE`.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /// @notice Resume operations. Restricted to `GUARDIAN_ROLE`.
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /// @notice Receive a cross-chain message. Reverts with `EnforcedPause` while paused.
    function receiveMessage(bytes calldata message) external whenNotPaused {
        _handleMessage(message);
        emit MessageReceived(keccak256(message));
    }

    /// @notice Withdraw bridged liquidity. Reverts with `EnforcedPause` while paused.
    function withdrawLiquidity(
        address token,
        uint256 amount,
        address to
    ) external whenNotPaused {
        _handleWithdrawLiquidity(token, amount, to);
        emit LiquidityWithdrawn(token, to, amount);
    }

    /// @dev Concrete receivers override with the real message-handling logic.
    function _handleMessage(bytes calldata message) internal virtual {}

    /// @dev Concrete receivers override with the real liquidity-withdrawal logic.
    function _handleWithdrawLiquidity(
        address token,
        uint256 amount,
        address to
    ) internal virtual {}
}
