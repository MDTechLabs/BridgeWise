// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BridgeTimelockController
 * @notice Governance timelock controller enforcing a mandatory execution delay on high-impact administrative changes.
 */
contract BridgeTimelockController is AccessControl {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");

    enum OperationState {
        Unset,
        Waiting,
        Ready,
        Done,
        Cancelled
    }

    uint256 public minDelay; // Minimum delay required in seconds
    uint256 public constant GRACE_PERIOD = 7 days; // Execution window after delay

    struct TimelockOperation {
        bytes32 id;
        address target;
        uint256 value;
        bytes data;
        uint256 readyTimestamp;
        bool executed;
        bool cancelled;
    }

    mapping(bytes32 => TimelockOperation) public operations;

    event OperationQueued(
        bytes32 indexed id,
        address indexed target,
        uint256 value,
        bytes data,
        uint256 readyTimestamp,
        uint256 minDelay
    );
    event OperationExecuted(bytes32 indexed id, address indexed executor);
    event OperationCancelled(bytes32 indexed id, address indexed canceller);
    event MinDelayChange(uint256 oldDuration, uint256 newDuration);

    constructor(
        uint256 _minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) {
        require(_minDelay >= 1 hours, "BridgeTimelock: delay too short");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        minDelay = _minDelay;

        for (uint256 i = 0; i < proposers.length; i++) {
            _grantRole(PROPOSER_ROLE, proposers[i]);
            _grantRole(CANCELLER_ROLE, proposers[i]);
        }

        for (uint256 i = 0; i < executors.length; i++) {
            _grantRole(EXECUTOR_ROLE, executors[i]);
        }
    }

    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data, predecessor, salt));
    }

    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external onlyRole(PROPOSER_ROLE) returns (bytes32 id) {
        require(delay >= minDelay, "BridgeTimelock: delay less than minDelay");
        id = hashOperation(target, value, data, predecessor, salt);

        require(operations[id].readyTimestamp == 0, "BridgeTimelock: operation already scheduled");

        uint256 readyTimestamp = block.timestamp + delay;
        operations[id] = TimelockOperation({
            id: id,
            target: target,
            value: value,
            data: data,
            readyTimestamp: readyTimestamp,
            executed: false,
            cancelled: false
        });

        emit OperationQueued(id, target, value, data, readyTimestamp, delay);
    }

    function cancel(bytes32 id) external onlyRole(CANCELLER_ROLE) {
        TimelockOperation storage op = operations[id];
        require(op.readyTimestamp > 0, "BridgeTimelock: operation not scheduled");
        require(!op.executed, "BridgeTimelock: operation already executed");
        require(!op.cancelled, "BridgeTimelock: operation already cancelled");

        op.cancelled = true;
        emit OperationCancelled(id, msg.sender);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external payable onlyRole(EXECUTOR_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        TimelockOperation storage op = operations[id];

        require(op.readyTimestamp > 0, "BridgeTimelock: operation not scheduled");
        require(!op.cancelled, "BridgeTimelock: operation cancelled");
        require(!op.executed, "BridgeTimelock: operation already executed");
        require(block.timestamp >= op.readyTimestamp, "BridgeTimelock: timelock delay not elapsed");
        require(block.timestamp <= op.readyTimestamp + GRACE_PERIOD, "BridgeTimelock: operation expired");

        op.executed = true;

        (bool success, ) = target.call{value: value}(data);
        require(success, "BridgeTimelock: operation execution failed");

        emit OperationExecuted(id, msg.sender);
    }

    function getOperationState(bytes32 id) external view returns (OperationState) {
        TimelockOperation memory op = operations[id];
        if (op.readyTimestamp == 0) return OperationState.Unset;
        if (op.cancelled) return OperationState.Cancelled;
        if (op.executed) return OperationState.Done;
        if (block.timestamp < op.readyTimestamp) return OperationState.Waiting;
        if (block.timestamp <= op.readyTimestamp + GRACE_PERIOD) return OperationState.Ready;
        return OperationState.Cancelled; // Expired operation
    }
}
