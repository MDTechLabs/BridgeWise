// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StringRequireRelayerHandler
/// @notice Control contract used only to benchmark gas/bytecode size against
///         `MockRelayerCallbackHandler`. Structurally identical, but gates its
///         callback with the naive `require(isRelayer[msg.sender], "Unauthorized relayer")`
///         pattern instead of a custom error, to measure the actual cost delta that
///         custom errors save on both the success and failure paths, plus deployed
///         bytecode size.
contract StringRequireRelayerHandler {
    address public admin;
    mapping(address => bool) public isRelayer;

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event MessageDelivered(bytes32 indexed messageId, address indexed relayer);

    uint256 public deliveredCount;

    constructor(address initialAdmin, address[] memory initialRelayers) {
        require(initialAdmin != address(0), "Zero address");
        admin = initialAdmin;

        for (uint256 i = 0; i < initialRelayers.length; i++) {
            address relayer = initialRelayers[i];
            require(relayer != address(0), "Zero address");
            isRelayer[relayer] = true;
            emit RelayerAdded(relayer);
        }
    }

    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "Unauthorized relayer");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Unauthorized admin");
        _;
    }

    function addRelayer(address relayer) external onlyAdmin {
        require(relayer != address(0), "Zero address");
        isRelayer[relayer] = true;
        emit RelayerAdded(relayer);
    }

    function removeRelayer(address relayer) external onlyAdmin {
        isRelayer[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    function deliverMessage(bytes32 messageId) external onlyRelayer returns (bool) {
        deliveredCount += 1;
        emit MessageDelivered(messageId, msg.sender);
        return true;
    }
}
