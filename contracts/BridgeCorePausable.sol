// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title BridgeCorePausable
 * @notice Cross-chain routing and execution platform with global emergency pause protection across all entry points.
 */
contract BridgeCorePausable is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    uint256 public chainId;
    mapping(bytes32 => bool) public executedTransfers;

    uint256[50] private __gap;

    event TransferExecuted(bytes32 indexed transferId, address indexed recipient, uint256 amount);
    event EmergencyPaused(address indexed account);
    event EmergencyUnpaused(address indexed account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _chainId) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();
        chainId = _chainId;
    }

    /**
     * @notice Emergency pause function callable by owner/operator to halt all entry points.
     */
    function pause() external onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    /**
     * @notice Unpause function to resume normal operations after incident resolution.
     */
    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }

    /**
     * @notice Primary cross-chain transfer execution entry point. Protected by whenNotPaused modifier.
     */
    function executeCrossChainTransfer(
        bytes32 transferId,
        address recipient,
        uint256 amount
    ) external onlyOwner whenNotPaused {
        require(!executedTransfers[transferId], "Transfer already executed");
        executedTransfers[transferId] = true;

        emit TransferExecuted(transferId, recipient, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}