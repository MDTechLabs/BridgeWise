// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract DurableOrchestrator is AccessControl {
    uint256 public constant MAX_RETRIES = 3;
    uint256 public constant BASE_DELAY = 1 minutes;

    enum ExecutionState {
        Pending,
        Executing,
        Completed,
        Failed,
        Retrying
    }

    struct Execution {
        bytes32 payloadHash;
        address target;
        bytes data;
        uint256 amount;
        address recipient;
        ExecutionState state;
        uint8 retryCount;
        uint256 createdAt;
        uint256 executedAt;
        uint256 nextRetryAt;
        bytes returnData;
    }

    mapping(uint256 => Execution) public executions;
    uint256 public nextExecutionId;
    uint256 public activeExecutionCount;

    event ExecutionCreated(uint256 indexed executionId, bytes32 payloadHash, address target, uint256 amount);
    event ExecutionStarted(uint256 indexed executionId);
    event ExecutionCompleted(uint256 indexed executionId, bytes returnData);
    event ExecutionFailed(uint256 indexed executionId, uint8 retryCount, string reason);
    event ExecutionRetrying(uint256 indexed executionId, uint256 nextRetryAt);

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error ExecutionNotFound(uint256 executionId);
    error ExecutionNotPending(uint256 executionId);
    error ExecutionAlreadyFinalized(uint256 executionId);
    error MaxRetriesExceeded(uint256 executionId, uint8 retries);
    error RetryNotReady(uint256 executionId, uint256 nextRetryAt);
    error InvalidState(uint256 executionId, ExecutionState state);

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        _;
    }

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function createExecution(
        bytes32 payloadHash,
        address target,
        bytes calldata data,
        uint256 amount,
        address recipient
    ) external onlyAdmin returns (uint256 executionId) {
        if (target == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        executionId = nextExecutionId++;
        Execution storage ex = executions[executionId];
        ex.payloadHash = payloadHash;
        ex.target = target;
        ex.data = data;
        ex.amount = amount;
        ex.recipient = recipient;
        ex.state = ExecutionState.Pending;
        ex.createdAt = block.timestamp;

        emit ExecutionCreated(executionId, payloadHash, target, amount);
    }

    function startExecution(uint256 executionId) external onlyAdmin {
        Execution storage ex = executions[executionId];
        if (executionId >= nextExecutionId) revert ExecutionNotFound(executionId);
        if (ex.state != ExecutionState.Pending) revert ExecutionNotPending(executionId);

        ex.state = ExecutionState.Executing;
        activeExecutionCount++;
        emit ExecutionStarted(executionId);
    }

    function completeExecution(uint256 executionId, bytes calldata returnData) external onlyAdmin {
        Execution storage ex = executions[executionId];
        if (executionId >= nextExecutionId) revert ExecutionNotFound(executionId);
        if (ex.state != ExecutionState.Executing) revert InvalidState(executionId, ex.state);

        ex.state = ExecutionState.Completed;
        ex.executedAt = block.timestamp;
        ex.returnData = returnData;
        activeExecutionCount--;
        emit ExecutionCompleted(executionId, returnData);
    }

    function failExecution(uint256 executionId, string calldata reason) external onlyAdmin {
        Execution storage ex = executions[executionId];
        if (executionId >= nextExecutionId) revert ExecutionNotFound(executionId);
        if (ex.state != ExecutionState.Executing && ex.state != ExecutionState.Retrying) {
            revert InvalidState(executionId, ex.state);
        }

        ex.retryCount++;
        if (ex.state == ExecutionState.Executing) {
            activeExecutionCount--;
        }

        if (ex.retryCount >= MAX_RETRIES) {
            ex.state = ExecutionState.Failed;
            emit ExecutionFailed(executionId, ex.retryCount, reason);
        } else {
            ex.state = ExecutionState.Retrying;
            ex.nextRetryAt = block.timestamp + (BASE_DELAY * ex.retryCount);
            emit ExecutionRetrying(executionId, ex.nextRetryAt);
            emit ExecutionFailed(executionId, ex.retryCount, reason);
        }
    }

    function retryExecution(uint256 executionId) external onlyAdmin {
        Execution storage ex = executions[executionId];
        if (executionId >= nextExecutionId) revert ExecutionNotFound(executionId);
        if (ex.state == ExecutionState.Completed || ex.state == ExecutionState.Failed) {
            revert ExecutionAlreadyFinalized(executionId);
        }
        if (ex.state == ExecutionState.Retrying && block.timestamp < ex.nextRetryAt) {
            revert RetryNotReady(executionId, ex.nextRetryAt);
        }
        if (ex.retryCount >= MAX_RETRIES) {
            revert MaxRetriesExceeded(executionId, ex.retryCount);
        }

        ex.state = ExecutionState.Retrying;
        ex.nextRetryAt = block.timestamp + (BASE_DELAY * (ex.retryCount + 1));
        emit ExecutionRetrying(executionId, ex.nextRetryAt);
    }

    function getExecution(uint256 executionId) external view returns (Execution memory) {
        return executions[executionId];
    }

    function getActiveExecutionCount() external view returns (uint256) {
        return activeExecutionCount;
    }
}
