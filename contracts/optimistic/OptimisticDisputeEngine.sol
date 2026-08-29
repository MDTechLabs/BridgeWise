// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OptimisticDisputeEngine {
    using SafeERC20 for IERC20;

    struct Proposal {
        address proposer;
        bytes32 stateRoot;
        uint256 timestamp;
        bool finalized;
        bool disputed;
    }

    IERC20 public immutable collateralToken;
    uint256 public immutable collateralAmount;
    uint256 public immutable challengePeriod;
    
    mapping(uint256 => Proposal) public proposals;
    uint256 public nextProposalId;

    event ProposalSubmitted(uint256 indexed proposalId, address indexed proposer, bytes32 stateRoot);
    event ProposalDisputed(uint256 indexed proposalId, address indexed challenger);
    event ProposalFinalized(uint256 indexed proposalId, bytes32 stateRoot);

    constructor(address _collateralToken, uint256 _collateralAmount, uint256 _challengePeriod) {
        collateralToken = IERC20(_collateralToken);
        collateralAmount = _collateralAmount;
        challengePeriod = _challengePeriod;
    }

    function proposeState(bytes32 stateRoot) external returns (uint256) {
        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        uint256 proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            stateRoot: stateRoot,
            timestamp: block.timestamp,
            finalized: false,
            disputed: false
        });

        emit ProposalSubmitted(proposalId, msg.sender, stateRoot);
        return proposalId;
    }

    function disputeState(uint256 proposalId, bytes memory proof) external {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.finalized, "Already finalized");
        require(!proposal.disputed, "Already disputed");
        require(block.timestamp <= proposal.timestamp + challengePeriod, "Challenge period over");
        
        require(proof.length > 0, "Invalid proof"); // Simplified for now

        proposal.disputed = true;

        // Slash collateral and award to challenger
        collateralToken.safeTransfer(msg.sender, collateralAmount);

        emit ProposalDisputed(proposalId, msg.sender);
    }

    function finalizeState(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.finalized, "Already finalized");
        require(!proposal.disputed, "Cannot finalize disputed");
        require(block.timestamp > proposal.timestamp + challengePeriod, "Challenge period not over");

        proposal.finalized = true;

        // Return collateral to proposer since it was undisputed
        collateralToken.safeTransfer(proposal.proposer, collateralAmount);

        emit ProposalFinalized(proposalId, proposal.stateRoot);
    }
}
