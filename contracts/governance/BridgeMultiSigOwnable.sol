// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BridgeMultiSigOwnable
 * @notice Multisignature administration contract for privileged bridge and treasury operations.
 * Requires M-of-N signatures from authorized owners before executing administrative operations.
 */
contract BridgeMultiSigOwnable {
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event ThresholdChanged(uint256 requiredThreshold);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address indexed target, bytes data);
    event ProposalConfirmed(uint256 indexed proposalId, address indexed owner);
    event ProposalRevoked(uint256 indexed proposalId, address indexed owner);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);

    struct TransactionProposal {
        address target;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmationsCount;
        uint256 expirationTime;
    }

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public requiredThreshold;

    TransactionProposal[] public proposals;
    // proposalId => owner => confirmed
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    modifier onlyOwner() {
        require(isOwner[msg.sender], "BridgeMultiSig: caller is not an owner");
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        require(proposalId < proposals.length, "BridgeMultiSig: proposal does not exist");
        _;
    }

    modifier notExecuted(uint256 proposalId) {
        require(!proposals[proposalId].executed, "BridgeMultiSig: proposal already executed");
        _;
    }

    modifier notExpired(uint256 proposalId) {
        require(block.timestamp <= proposals[proposalId].expirationTime, "BridgeMultiSig: proposal expired");
        _;
    }

    constructor(address[] memory _owners, uint256 _requiredThreshold) {
        require(_owners.length > 0, "BridgeMultiSig: owners required");
        require(_requiredThreshold > 0 && _requiredThreshold <= _owners.length, "BridgeMultiSig: invalid threshold");

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "BridgeMultiSig: invalid owner address");
            require(!isOwner[owner], "BridgeMultiSig: duplicate owner");

            isOwner[owner] = true;
            owners.push(owner);
            emit OwnerAdded(owner);
        }

        requiredThreshold = _requiredThreshold;
        emit ThresholdChanged(_requiredThreshold);
    }

    function proposeTransaction(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 durationSeconds
    ) external onlyOwner returns (uint256 proposalId) {
        require(target != address(0), "BridgeMultiSig: invalid target");
        require(durationSeconds >= 300, "BridgeMultiSig: duration too short"); // minimum 5 mins

        proposalId = proposals.length;
        uint256 expirationTime = block.timestamp + durationSeconds;

        proposals.push(
            TransactionProposal({
                target: target,
                value: value,
                data: data,
                executed: false,
                confirmationsCount: 1,
                expirationTime: expirationTime
            })
        );

        isConfirmed[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, target, data);
        emit ProposalConfirmed(proposalId, msg.sender);
    }

    function confirmTransaction(uint256 proposalId)
        external
        onlyOwner
        proposalExists(proposalId)
        notExecuted(proposalId)
        notExpired(proposalId)
    {
        require(!isConfirmed[proposalId][msg.sender], "BridgeMultiSig: proposal already confirmed");

        TransactionProposal storage proposal = proposals[proposalId];
        proposal.confirmationsCount += 1;
        isConfirmed[proposalId][msg.sender] = true;

        emit ProposalConfirmed(proposalId, msg.sender);
    }

    function revokeConfirmation(uint256 proposalId)
        external
        onlyOwner
        proposalExists(proposalId)
        notExecuted(proposalId)
    {
        require(isConfirmed[proposalId][msg.sender], "BridgeMultiSig: proposal not confirmed");

        TransactionProposal storage proposal = proposals[proposalId];
        proposal.confirmationsCount -= 1;
        isConfirmed[proposalId][msg.sender] = false;

        emit ProposalRevoked(proposalId, msg.sender);
    }

    function executeTransaction(uint256 proposalId)
        external
        onlyOwner
        proposalExists(proposalId)
        notExecuted(proposalId)
        notExpired(proposalId)
    {
        TransactionProposal storage proposal = proposals[proposalId];
        require(proposal.confirmationsCount >= requiredThreshold, "BridgeMultiSig: threshold not met");

        proposal.executed = true;

        (bool success, ) = proposal.target.call{value: proposal.value}(proposal.data);
        require(success, "BridgeMultiSig: transaction execution failed");

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getProposalsCount() external view returns (uint256) {
        return proposals.length;
    }
}
