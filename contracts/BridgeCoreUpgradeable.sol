// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title BridgeCoreUpgradeable
 * @notice Core cross-chain routing and execution contract with UUPS upgrade safety and storage gap.
 */
contract BridgeCoreUpgradeable is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // State variables
    uint256 public chainId;
    mapping(bytes32 => bool) public executedTransfers;

    // Storage gap for future upgrades (Prevents storage collision during inheritance)
    uint256[50] private __gap;

    event TransferExecuted(bytes32 indexed transferId, address indexed recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _chainId) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        chainId = _chainId;
    }

    function executeCrossChainTransfer(
        bytes32 transferId,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        require(!executedTransfers[transferId], "Transfer already executed");
        executedTransfers[transferId] = true;

        emit TransferExecuted(transferId, recipient, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}