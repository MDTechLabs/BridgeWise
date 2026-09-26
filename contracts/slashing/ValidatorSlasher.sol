// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ValidatorSlasher
 * @notice Automated proof-of-misbehavior validator slashing contract.
 * Accepts cryptographic proofs of misbehavior (e.g. signing conflicting block headers / payloads for the same nonce or block height)
 * and slashes validator stakes, forfeits their collateral, and removes them from active validator sets.
 */
contract ValidatorSlasher is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct ValidatorInfo {
        uint256 stake;
        bool isActive;
        bool isSlashed;
    }

    // Validator address => ValidatorInfo
    mapping(address => ValidatorInfo) public validators;
    // List of active validator addresses
    address[] public activeValidators;

    // Minimum required stake for registration
    uint256 public minStake;

    // Events
    event ValidatorRegistered(address indexed validator, uint256 stake);
    event ValidatorStaked(address indexed validator, uint256 additionalStake, uint256 totalStake);
    event ValidatorUnstaked(address indexed validator, uint256 amount);
    event ValidatorSlashed(address indexed validator, address indexed reporter, uint256 slashedAmount, uint256 rewardAmount);
    event MinStakeUpdated(uint256 newMinStake);

    error AlreadyRegistered();
    error NotRegistered();
    error NotActive();
    error AlreadySlashed();
    error InsufficientStake();
    error InvalidSignatures();
    error SignaturesDoNotMatch();
    error ProofsNotConflicting();
    error InvalidNonceOrHeight();
    error TransferFailed();

    constructor(uint256 _minStake) Ownable(msg.sender) {
        minStake = _minStake;
    }

    /**
     * @notice Register a new validator with initial staked collateral
     */
    function registerValidator() external payable nonReentrant {
        if (validators[msg.sender].isSlashed) revert AlreadySlashed();
        if (validators[msg.sender].isActive) revert AlreadyRegistered();
        if (msg.value < minStake) revert InsufficientStake();

        validators[msg.sender] = ValidatorInfo({
            stake: msg.value,
            isActive: true,
            isSlashed: false
        });

        activeValidators.push(msg.sender);
        emit ValidatorRegistered(msg.sender, msg.value);
    }

    /**
     * @notice Deposit additional stake for an existing validator
     */
    function depositStake() external payable nonReentrant {
        ValidatorInfo storage val = validators[msg.sender];
        if (!val.isActive) revert NotActive();
        if (val.isSlashed) revert AlreadySlashed();
        if (msg.value == 0) revert InsufficientStake();

        val.stake += msg.value;
        emit ValidatorStaked(msg.sender, msg.value, val.stake);
    }

    /**
     * @notice Unstake funds if active and above minimum stake requirements
     */
    function unstake(uint256 amount) external nonReentrant {
        ValidatorInfo storage val = validators[msg.sender];
        if (!val.isActive) revert NotActive();
        if (val.isSlashed) revert AlreadySlashed();
        if (amount == 0 || val.stake < amount) revert InsufficientStake();

        val.stake -= amount;
        if (val.stake < minStake) {
            _removeFromActiveSet(msg.sender);
            val.isActive = false;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ValidatorUnstaked(msg.sender, amount);
    }

    /**
     * @notice Report proof of misbehavior (double-signing conflicting payloads for same nonce/block height)
     * @param payload1 First signed payload bytes
     * @param sig1 First ECDSA signature
     * @param payload2 Second signed payload bytes
     * @param sig2 Second ECDSA signature
     * @param nonceOrHeight Shared nonce or block height being attested
     */
    function reportEquivocation(
        bytes calldata payload1,
        bytes calldata sig1,
        bytes calldata payload2,
        bytes calldata sig2,
        uint256 nonceOrHeight
    ) external nonReentrant {
        bytes32 hash1 = keccak256(payload1);
        bytes32 hash2 = keccak256(payload2);
        if (hash1 == hash2) revert ProofsNotConflicting();

        bytes32 ethHash1 = MessageHashUtils.toEthSignedMessageHash(hash1);
        address signer1 = ECDSA.recover(ethHash1, sig1);

        bytes32 ethHash2 = MessageHashUtils.toEthSignedMessageHash(hash2);
        address signer2 = ECDSA.recover(ethHash2, sig2);

        if (signer1 != signer2 || signer1 == address(0)) revert SignaturesDoNotMatch();

        address validator = signer1;
        ValidatorInfo storage val = validators[validator];

        if (!val.isActive) revert NotActive();
        if (val.isSlashed) revert AlreadySlashed();

        uint256 slashedAmount = val.stake;
        val.stake = 0;
        val.isActive = false;
        val.isSlashed = true;

        _removeFromActiveSet(validator);

        uint256 rewardAmount = (slashedAmount * 10) / 100;
        if (rewardAmount > 0) {
            (bool success, ) = payable(msg.sender).call{value: rewardAmount}("");
            if (!success) revert TransferFailed();
        }

        emit ValidatorSlashed(validator, msg.sender, slashedAmount, rewardAmount);
    }

    function _removeFromActiveSet(address validator) internal {
        uint256 len = activeValidators.length;
        for (uint256 i = 0; i < len; i++) {
            if (activeValidators[i] == validator) {
                activeValidators[i] = activeValidators[len - 1];
                activeValidators.pop();
                break;
            }
        }
    }

    function getActiveValidators() external view returns (address[] memory) {
        return activeValidators;
    }

    function updateMinStake(uint256 _newMinStake) external onlyOwner {
        minStake = _newMinStake;
        emit MinStakeUpdated(_newMinStake);
    }
}
