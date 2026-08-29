// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BridgeVault Test Fixture for Rule B013: Unbounded Loop Analysis
contract B013Samples {
    address[] public activeProviders;
    address[] public supportedAssets;

    // VULNERABLE: Direct iteration over unbounded storage array length
    function calculateTotalProviderFeesVulnerable() external view returns (uint256 total) {
        for (uint256 i = 0; i < activeProviders.length; i++) {
            total += 100;
        }
    }

    // SAFE: Paginated iteration with explicit offset and limit
    function calculateTotalProviderFeesPaginated(uint256 offset, uint256 limit) external view returns (uint256 total) {
        uint256 end = offset + limit;
        for (uint256 i = offset; i < end && i < activeProviders.length; i++) {
            total += 100;
        }
    }

    // SAFE: Fixed-size loop bounded by constant MAX_PROVIDERS
    function processFixedProviders() external view returns (uint256 total) {
        uint256 maxIter = 10;
        for (uint256 i = 0; i < maxIter && i < activeProviders.length; i++) {
            total += 50;
        }
    }
}
