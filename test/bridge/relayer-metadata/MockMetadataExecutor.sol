// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RelayerMetadataVerifier} from "../../../contracts/bridge/RelayerMetadataVerifier.sol";

contract MockBridgeERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "INSUFFICIENT_BALANCE");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "INSUFFICIENT_ALLOWANCE");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockExecutionTarget {
    bool public shouldRevert;
    uint256 public callCount;
    bytes32 public lastPayloadHash;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function handleBridgeCall(bytes calldata payload) external returns (bool) {
        if (shouldRevert) revert("TARGET_EXECUTION_FAILED");
        callCount += 1;
        lastPayloadHash = keccak256(payload);
        return true;
    }
}

/// @notice Integration harness combining RelayerMetadataVerifier with asset release,
///         fallback escrow on target revert, retry, and user refund/recovery.
contract MockMetadataExecutor {
    RelayerMetadataVerifier public immutable verifier;

    struct EscrowRecord {
        address recipient;
        address token;
        uint256 amount;
        bool claimed;
        bool retried;
    }

    mapping(bytes32 => EscrowRecord) public escrows;
    uint256 public totalReleased;
    uint256 public totalEscrowed;
    uint256 public totalRefunded;

    event Executed(bytes32 indexed messageId, bool targetSucceeded, uint256 amount);
    event Escrowed(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event Refunded(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event Retried(bytes32 indexed messageId, bool succeeded);

    error AlreadySettled();
    error UnauthorizedClaim();
    error NothingToClaim();

    constructor(address _verifier) {
        verifier = RelayerMetadataVerifier(_verifier);
    }

    function relayMessage(
        RelayerMetadataVerifier.MessageMetadata calldata meta,
        bytes calldata data,
        bytes calldata packedSignatures,
        address target
    ) external returns (bytes32 messageId, bool targetSucceeded) {
        messageId = verifier.verifyAndConsumeMetadata(meta, data, packedSignatures);

        (targetSucceeded, ) = target.call(data);

        if (targetSucceeded) {
            require(MockBridgeERC20(meta.token).transfer(meta.recipient, meta.amount), "TRANSFER_FAILED");
            totalReleased += meta.amount;
        } else {
            escrows[messageId] = EscrowRecord({
                recipient: meta.recipient,
                token: meta.token,
                amount: meta.amount,
                claimed: false,
                retried: false
            });
            totalEscrowed += meta.amount;
            emit Escrowed(messageId, meta.recipient, meta.amount);
        }

        emit Executed(messageId, targetSucceeded, meta.amount);
    }

    function retryEscrowed(bytes32 messageId, address target, bytes calldata data) external returns (bool ok) {
        EscrowRecord storage rec = escrows[messageId];
        if (rec.amount == 0) revert NothingToClaim();
        if (rec.claimed || rec.retried) revert AlreadySettled();

        (ok, ) = target.call(data);
        if (ok) {
            rec.retried = true;
            totalEscrowed -= rec.amount;
            totalReleased += rec.amount;
            require(MockBridgeERC20(rec.token).transfer(rec.recipient, rec.amount), "TRANSFER_FAILED");
        }
        emit Retried(messageId, ok);
    }

    function claimRefund(bytes32 messageId) external {
        EscrowRecord storage rec = escrows[messageId];
        if (rec.amount == 0) revert NothingToClaim();
        if (rec.claimed || rec.retried) revert AlreadySettled();
        if (msg.sender != rec.recipient) revert UnauthorizedClaim();

        rec.claimed = true;
        totalEscrowed -= rec.amount;
        totalRefunded += rec.amount;
        require(MockBridgeERC20(rec.token).transfer(rec.recipient, rec.amount), "REFUND_FAILED");
        emit Refunded(messageId, rec.recipient, rec.amount);
    }
}
