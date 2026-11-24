
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BridgeAccessControl
/// @notice Reusable relayer-role access control for destination-chain callback handlers.
/// @dev Provides a lightweight admin mechanism without imposing an ownership model
///      on inheriting contracts. Uses custom errors to minimize revert overhead.
contract BridgeAccessControl {
    /// @notice Address authorized to manage relayer permissions.
    address public admin;

    /// @notice Tracks whether an address is an authorized relayer.
    mapping(address => bool) public isRelayer;

    /// @notice Emitted when a relayer is authorized.
    event RelayerAdded(address indexed relayer);

    /// @notice Emitted when a relayer's authorization is revoked.
    event RelayerRemoved(address indexed relayer);

    /// @notice Caller is not an authorized relayer.
    error UnauthorizedRelayer();

    /// @notice Caller is not the admin.
    error UnauthorizedAdmin();

    /// @notice A zero address was supplied where it is not permitted.
    error ZeroAddress();

    /// @param initialAdmin Address authorized to manage relayers.
    /// @param initialRelayers Initial list of authorized relayer addresses.
    constructor(
        address initialAdmin,
        address[] memory initialRelayers
    ) {
        if (initialAdmin == address(0)) revert ZeroAddress();

        admin = initialAdmin;

        uint256 relayerCount = initialRelayers.length;

        for (uint256 i; i < relayerCount;) {
            _addRelayer(initialRelayers[i]);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Restricts access to authorized relayers.
    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert UnauthorizedRelayer();
        _;
    }

    /// @notice Restricts access to the admin.
    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    /// @notice Authorizes a relayer.
    /// @dev Does nothing if the address is already authorized.
    /// @param relayer Address to authorize.
    function addRelayer(address relayer) external onlyAdmin {
        _addRelayer(relayer);
    }

    /// @notice Revokes a relayer's authorization.
    /// @dev Does nothing if the address is not currently authorized.
    /// @param relayer Address to deauthorize.
    function removeRelayer(address relayer) external onlyAdmin {
        if (!isRelayer[relayer]) return;

        isRelayer[relayer] = false;

        emit RelayerRemoved(relayer);
    }

    /// @notice Internal helper to authorize a relayer.
    /// @dev Reverts for the zero address and skips already authorized addresses.
    /// @param relayer Address to authorize.
    function _addRelayer(address relayer) internal {
        if (relayer == address(0)) revert ZeroAddress();
        if (isRelayer[relayer]) return;

        isRelayer[relayer] = true;

        emit RelayerAdded(relayer);
    }
}
