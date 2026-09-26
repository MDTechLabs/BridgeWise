// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BridgeAccessControl
/// @notice Lightweight, reusable relayer-role access control mixin meant to be inherited
///         by destination-chain callback handlers (e.g. cross-chain message receivers)
///         that need to restrict privileged entry points to a known set of relayer
///         addresses.
/// @dev Uses custom errors instead of string-based `require` reverts to reduce both
///      deployed bytecode size and the runtime gas cost of the failure path for
///      high-frequency relayer callbacks (no revert-reason string to ABI-encode/copy
///      on revert).
///
///      Admin mechanism: this contract intentionally does NOT inherit `BridgeOwnable`
///      (OpenZeppelin's `Ownable2Step`). `BridgeOwnable` pulls in the full two-step
///      ownership-transfer state machine (`pendingOwner`, `acceptOwnership`,
///      `renounceOwnership`, etc.), which solves a different problem than simple
///      relayer-role bookkeeping. Forcing every destination-chain callback handler
///      that wants to mix in relayer access control to also adopt (and correctly
///      linearize the constructor of) OZ's `Ownable2Step` would be awkward for
///      handlers that already manage their own ownership model independently.
///      Instead, a minimal, self-contained `admin` address is used here, keeping this
///      contract single-purpose and easy to compose into other contracts.
contract BridgeAccessControl {
    /// @notice The admin address permitted to add/remove relayers.
    address public admin;

    /// @notice Whether a given address is currently an authorized relayer.
    mapping(address => bool) public isRelayer;

    /// @notice Emitted when a relayer is authorized.
    event RelayerAdded(address indexed relayer);

    /// @notice Emitted when a relayer's authorization is revoked.
    event RelayerRemoved(address indexed relayer);

    /// @notice Thrown when a non-relayer calls a relayer-gated function.
    error UnauthorizedRelayer();

    /// @notice Thrown when a non-admin calls an admin-gated function.
    error UnauthorizedAdmin();

    /// @notice Thrown when the zero address is supplied where not permitted.
    error ZeroAddress();

    /// @param initialAdmin    The initial admin address, permitted to manage relayers.
    /// @param initialRelayers Optional list of relayer addresses to authorize at deployment.
    constructor(address initialAdmin, address[] memory initialRelayers) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        admin = initialAdmin;

        for (uint256 i = 0; i < initialRelayers.length; i++) {
            _addRelayer(initialRelayers[i]);
        }
    }

    /// @notice Restricts a function to authorized relayer callers.
    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert UnauthorizedRelayer();
        _;
    }

    /// @notice Restricts a function to the admin.
    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    /// @notice Authorize a new relayer address.
    /// @param relayer The address to authorize.
    function addRelayer(address relayer) external onlyAdmin {
        _addRelayer(relayer);
    }

    /// @notice Revoke a relayer's authorization.
    /// @param relayer The address to deauthorize.
    function removeRelayer(address relayer) external onlyAdmin {
        if (!isRelayer[relayer]) return;
        isRelayer[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    function _addRelayer(address relayer) internal {
        if (relayer == address(0)) revert ZeroAddress();
        if (isRelayer[relayer]) return;
        isRelayer[relayer] = true;
        emit RelayerAdded(relayer);
    }
}
