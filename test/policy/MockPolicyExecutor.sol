// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISignerPolicy {
    function authorizeAndConsume(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash
    ) external;
}

contract MockPolicyExecutor {
    ISignerPolicy public immutable policy;
    uint256 public attempts;

    constructor(address policyAddress) {
        policy = ISignerPolicy(policyAddress);
    }

    function execute(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash,
        address target,
        bytes calldata data
    ) external returns (bool success) {
        attempts += 1;
        policy.authorizeAndConsume(
            operationId, signer, chainId, destination, selector, payloadHash
        );
        bytes memory returnData;
        (success, returnData) = target.call(data);
        if (!success) {
            assembly {
                revert(add(returnData, 0x20), mload(returnData))
            }
        }
    }
}
