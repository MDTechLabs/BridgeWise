// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CanonicalPayloadVerifier} from "../../../contracts/bridge/CanonicalPayloadVerifier.sol";

contract MockCanonicalERC20 {
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

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockCanonicalTarget {
    bool public shouldRevert;
    bytes32 public lastPayloadHash;
    uint256 public callCount;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function onCanonicalMessage(bytes calldata payload) external {
        if (shouldRevert) revert("TARGET_EXECUTION_FAILED");
        lastPayloadHash = keccak256(payload);
        callCount += 1;
    }
}

/// @notice Destination-chain bridge executor harness for testing CanonicalPayloadVerifier
///         accounting conservation across success, revert, retry, and fallback escrow/refund paths.
contract MockCanonicalExecutor {
    CanonicalPayloadVerifier public immutable verifier;

    mapping(bytes32 => uint256) public escrowedAmount;
    mapping(bytes32 => address) public escrowedToken;
    mapping(bytes32 => address) public escrowedRecipient;
    mapping(bytes32 => bool) public escrowClaimed;

    uint256 public totalReleased;
    uint256 public totalEscrowed;
    uint256 public totalRefunded;

    event MessageExecuted(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event MessageEscrowed(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event EscrowRefunded(bytes32 indexed messageId, address indexed recipient, uint256 amount);

    constructor(address _verifier) {
        verifier = CanonicalPayloadVerifier(_verifier);
    }

    function executeCanonicalMessage(
        bytes calldata envelope,
        bytes calldata packedSignatures,
        address target
    ) external returns (bytes32 messageId, bool executed) {
        CanonicalPayloadVerifier.CanonicalMessage memory m;
        (m, messageId, ) = verifier.verifyAndConsumeCanonicalEnvelope(envelope, packedSignatures);

        if (target != address(0)) {
            try MockCanonicalTarget(target).onCanonicalMessage(m.payload) {
                require(MockCanonicalERC20(m.token).transfer(m.recipient, m.amount), "TRANSFER_FAILED");
                totalReleased += m.amount;
                emit MessageExecuted(messageId, m.recipient, m.amount);
                return (messageId, true);
            } catch {
                escrowedAmount[messageId] = m.amount;
                escrowedToken[messageId] = m.token;
                escrowedRecipient[messageId] = m.recipient;
                totalEscrowed += m.amount;
                emit MessageEscrowed(messageId, m.recipient, m.amount);
                return (messageId, false);
            }
        }

        require(MockCanonicalERC20(m.token).transfer(m.recipient, m.amount), "TRANSFER_FAILED");
        totalReleased += m.amount;
        emit MessageExecuted(messageId, m.recipient, m.amount);
        return (messageId, true);
    }

    function claimEscrowRefund(bytes32 messageId) external {
        uint256 amount = escrowedAmount[messageId];
        require(amount > 0, "NO_ESCROW");
        require(!escrowClaimed[messageId], "ALREADY_CLAIMED");
        address recipient = escrowedRecipient[messageId];
        require(msg.sender == recipient, "NOT_RECIPIENT");

        escrowClaimed[messageId] = true;
        totalEscrowed -= amount;
        totalRefunded += amount;

        require(MockCanonicalERC20(escrowedToken[messageId]).transfer(recipient, amount), "REFUND_FAILED");
        emit EscrowRefunded(messageId, recipient, amount);
    }
}
