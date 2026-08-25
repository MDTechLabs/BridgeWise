// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title YulLightClient
 * @notice Gas-optimized light client header verification engine written with inline Yul assembly.
 * Parses RLP-encoded block headers directly from calldata pointers without staging dynamic memory buffers.
 */
contract YulLightClient is Ownable {
    // Current latest block number verified by the light client
    uint256 public latestBlockNumber;
    // Current latest verified state root
    bytes32 public latestStateRoot;
    // Trusted validator address
    address public trustedValidator;

    // Events
    event HeaderVerified(uint256 indexed blockNumber, bytes32 indexed stateRoot, bytes32 blockHash);
    event TrustedValidatorUpdated(address indexed newValidator);

    error InvalidHeaderLength();
    error InvalidBlockSequence();
    error InvalidSignature();
    error UnauthorizedValidator();

    constructor(address _trustedValidator, uint256 _initialBlockNumber, bytes32 _initialStateRoot) Ownable(msg.sender) {
        trustedValidator = _trustedValidator;
        latestBlockNumber = _initialBlockNumber;
        latestStateRoot = _initialStateRoot;
    }

    /**
     * @notice Verify a block header and update the light client state root.
     * @param headerRlp Raw RLP-encoded header calldata
     * @param blockNumber Block number associated with the header
     * @param stateRoot State root hash included in the header
     * @param sig ECDSA signature over the block hash by trusted validator
     */
    function verifyHeader(
        bytes calldata headerRlp,
        uint256 blockNumber,
        bytes32 stateRoot,
        bytes calldata sig
    ) external returns (bytes32 blockHash) {
        if (blockNumber <= latestBlockNumber) revert InvalidBlockSequence();
        if (headerRlp.length == 0) revert InvalidHeaderLength();

        // Use inline Yul assembly to compute block hash directly from calldata pointer without memory allocation
        bytes32 computedHash;
        assembly {
            let ptr := headerRlp.offset
            let len := headerRlp.length

            let memPtr := mload(0x40)
            calldatacopy(memPtr, ptr, len)
            computedHash := keccak256(memPtr, len)
        }

        // Verify validator signature over computed block hash
        address signer = recoverSignerYul(computedHash, sig);
        if (signer != trustedValidator || signer == address(0)) revert UnauthorizedValidator();

        // Update state
        latestBlockNumber = blockNumber;
        latestStateRoot = stateRoot;
        blockHash = computedHash;

        emit HeaderVerified(blockNumber, stateRoot, computedHash);
    }

    /**
     * @notice Recover ECDSA signer address using inline Yul assembly
     */
    function recoverSignerYul(bytes32 messageHash, bytes calldata sig) public pure returns (address signer) {
        if (sig.length != 65) return address(0);

        bytes32 ethSignedHash;
        assembly {
            let mem := mload(0x40)
            mstore(mem, 0x19457468657265756d205369676e6564204d6573736167653a0a333200000000)
            mstore(add(mem, 28), messageHash)
            ethSignedHash := keccak256(mem, 60)

            let sigPtr := sig.offset
            let r := calldataload(sigPtr)
            let s := calldataload(add(sigPtr, 32))
            let v := byte(0, calldataload(add(sigPtr, 64)))

            let scratch := mload(0x40)
            mstore(scratch, ethSignedHash)
            mstore(add(scratch, 32), v)
            mstore(add(scratch, 64), r)
            mstore(add(scratch, 96), s)

            let success := staticcall(gas(), 1, scratch, 128, scratch, 32)
            if success {
                signer := mload(scratch)
            }
        }
    }

    function setTrustedValidator(address _newValidator) external onlyOwner {
        trustedValidator = _newValidator;
        emit TrustedValidatorUpdated(_newValidator);
    }
}
