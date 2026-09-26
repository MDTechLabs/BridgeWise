// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeadStorageBridge
 * @notice Demonstrates dead storage declarations (rule B006) alongside valid storage references.
 */
contract DeadStorageBridge {
    // Public state variable - implicit getter generated (VALID, not flagged)
    uint256 public activeBridgeId;

    // Private state variable - referenced in logic (VALID, not flagged)
    address private bridgeAdmin;

    // Private state variable - NEVER referenced (FLAGGED as dead storage)
    uint256 private unusedConfigValue;

    // Internal state variable - NEVER referenced (FLAGGED as dead storage)
    bytes32 internal deadHash;

    // Public mapping - implicit getter generated (VALID, not flagged)
    mapping(address => uint256) public balances;

    // Private mapping - NEVER referenced (FLAGGED as dead storage)
    mapping(address => bool) private unusedMapping;

    constructor(address _admin) {
        bridgeAdmin = _admin;
        activeBridgeId = 1;
    }

    function getAdmin() external view returns (address) {
        return bridgeAdmin;
    }

    function setBalance(address account, uint256 amount) external {
        require(msg.sender == bridgeAdmin, "Unauthorized");
        balances[account] = amount;
    }
}

/**
 * @title ActiveStorageBridge
 * @notice All storage state variables are properly referenced or exposed via public getters.
 */
contract ActiveStorageBridge {
    address private owner;
    uint256 private totalVolume;
    bool public isPaused;

    event VolumeAdded(uint256 amount);

    constructor() {
        owner = msg.sender;
        totalVolume = 0;
        isPaused = false;
    }

    function addVolume(uint256 amount) external {
        require(!isPaused, "Paused");
        require(msg.sender == owner, "Only owner");
        totalVolume += amount;
        emit VolumeAdded(amount);
    }

    function getVolume() external view returns (uint256) {
        return totalVolume;
    }
}
