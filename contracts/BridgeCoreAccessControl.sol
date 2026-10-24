// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title BridgeCoreAccessControl
 * @notice Core cross-chain routing and execution contract with role-based access control (RBAC),
 *         role revocation verification, idempotency checks, and operator diagnostic audit events.
 */
contract BridgeCoreAccessControl is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    uint256 public chainId;
    mapping(bytes32 => bool) public executedTransfers;

    // Storage gap for upgrade safety
    uint256[50] private __gap;

    event TransferExecuted(bytes32 indexed transferId, address indexed recipient, uint256 amount);
    event RoleRevocationVerified(bytes32 indexed role, address indexed account, address indexed verifier);
    event ExecutionAttemptRejected(bytes32 indexed transferId, address indexed caller, string reason);

    error TransferAlreadyExecuted(bytes32 transferId);
    error InvalidRecipient();
    error InvalidAmount();
    error RoleNotRevoked(bytes32 role, address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _chainId, address admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, admin);
        _grantRole(ROUTER_ROLE, admin);

        chainId = _chainId;
    }

    /**
     * @notice Execute cross-chain transfer restricted to EXECUTOR_ROLE holders.
     * @dev Enforces idempotency (no duplicate execution) and parameter validation.
     */
    function executeCrossChainTransfer(
        bytes32 transferId,
        address recipient,
        uint256 amount
    ) external onlyRole(EXECUTOR_ROLE) {
        if (executedTransfers[transferId]) {
            emit ExecutionAttemptRejected(transferId, msg.sender, "Transfer already executed");
            revert TransferAlreadyExecuted(transferId);
        }
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        executedTransfers[transferId] = true;
        emit TransferExecuted(transferId, recipient, amount);
    }

    /**
     * @notice Verify and audit that a role has been revoked from an account.
     * @dev Restricted to OPERATOR_ROLE (or admin). Useful for governance/incident response
     *      verification pipelines before resuming routing or clearing quarantine.
     */
    function verifyRoleRevocation(bytes32 role, address account) external onlyRole(OPERATOR_ROLE) returns (bool) {
        if (hasRole(role, account)) {
            revert RoleNotRevoked(role, account);
        }

        emit RoleRevocationVerified(role, account, msg.sender);
        return true;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
