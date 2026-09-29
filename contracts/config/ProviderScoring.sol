// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ProviderScoring
/// @notice Scores providers using reliability, price, latency, liquidity, and failure history.
///         Providers below a configurable score threshold are excluded from routing.
contract ProviderScoring is AccessControl {
    struct ProviderScore {
        uint256 reliability;   // basis points (0-10000)
        uint256 priceScore;    // basis points (0-10000)
        uint256 latencyScore;  // basis points (0-10000)
        uint256 liquidityScore; // basis points (0-10000)
        uint256 failureCount;
        uint256 totalCalls;
        uint256 lastUpdated;
        bool excluded;
    }

    mapping(address => ProviderScore) public providerScores;
    uint256 public minScoreThreshold;
    uint256 public maxFailureCount;
    uint256 public constant BPS = 10_000;

    event ProviderScored(address indexed provider, uint256 compositeScore, bool excluded);
    event ProviderExcluded(address indexed provider, string reason);
    event ProviderReinstated(address indexed provider);
    event ThresholdUpdated(uint256 newThreshold);
    event MaxFailuresUpdated(uint256 newMax);

    error ZeroAddress();
    error BelowThreshold(uint256 score, uint256 threshold);
    error MaxFailuresExceeded(uint256 failures, uint256 max);

    constructor(address admin, uint256 _minScoreThreshold, uint256 _maxFailureCount) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        minScoreThreshold = _minScoreThreshold;
        maxFailureCount = _maxFailureCount;
    }

    /// @notice Score a provider across all dimensions.
    function scoreProvider(
        address provider,
        uint256 reliability,
        uint256 priceScore,
        uint256 latencyScore,
        uint256 liquidityScore
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (provider == address(0)) revert ZeroAddress();
        if (reliability > BPS || priceScore > BPS || latencyScore > BPS || liquidityScore > BPS) {
            revert ZeroAddress();
        }

        ProviderScore storage ps = providerScores[provider];
        ps.reliability = reliability;
        ps.priceScore = priceScore;
        ps.latencyScore = latencyScore;
        ps.liquidityScore = liquidityScore;
        ps.lastUpdated = block.timestamp;

        uint256 composite = (reliability + priceScore + latencyScore + liquidityScore) / 4;
        bool shouldExclude = composite < minScoreThreshold || ps.failureCount >= maxFailureCount;

        if (shouldExclude && !ps.excluded) {
            ps.excluded = true;
            emit ProviderExcluded(provider, "Below threshold or max failures");
        } else if (!shouldExclude && ps.excluded) {
            ps.excluded = false;
            emit ProviderReinstated(provider);
        }

        emit ProviderScored(provider, composite, ps.excluded);
    }

    /// @notice Record a successful call for a provider.
    function recordSuccess(address provider) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (provider == address(0)) revert ZeroAddress();
        ProviderScore storage ps = providerScores[provider];
        ps.totalCalls++;
        ps.lastUpdated = block.timestamp;
    }

    /// @notice Record a failed call for a provider.
    function recordFailure(address provider) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (provider == address(0)) revert ZeroAddress();
        ProviderScore storage ps = providerScores[provider];
        ps.failureCount++;
        ps.totalCalls++;
        ps.lastUpdated = block.timestamp;

        if (ps.failureCount >= maxFailureCount && !ps.excluded) {
            ps.excluded = true;
            emit ProviderExcluded(provider, "Max failures exceeded");
        }
    }

    /// @notice Check if a provider is eligible for routing.
    function isEligible(address provider) external view returns (bool) {
        ProviderScore memory ps = providerScores[provider];
        if (ps.excluded) return false;
        if (ps.totalCalls == 0) return true;
        uint256 composite = (ps.reliability + ps.priceScore + ps.latencyScore + ps.liquidityScore) / 4;
        return composite >= minScoreThreshold && ps.failureCount < maxFailureCount;
    }

    /// @notice Get composite score for a provider.
    function getCompositeScore(address provider) external view returns (uint256) {
        ProviderScore memory ps = providerScores[provider];
        return (ps.reliability + ps.priceScore + ps.latencyScore + ps.liquidityScore) / 4;
    }

    /// @notice Update the minimum score threshold.
    function setMinScoreThreshold(uint256 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minScoreThreshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Update the maximum failure count before exclusion.
    function setMaxFailureCount(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxFailureCount = newMax;
        emit MaxFailuresUpdated(newMax);
    }
}
