// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPriceOracle
/// @notice Common shape for a price source consumed by {BridgeMultiOracle}.
/// @dev Adapters normalise their underlying feed to 18 decimals so the
///      aggregator can compare sources without knowing where they came from.
interface IPriceOracle {
    /// @notice Latest price, scaled to 18 decimals.
    /// @return price      Asset price with 18 decimals of precision.
    /// @return updatedAt  Unix timestamp the observation was produced.
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);

    /// @notice Human-readable source identifier, for events and debugging.
    function description() external view returns (string memory);
}

/// @dev Minimal Chainlink aggregator surface. Declared locally so the project
///      does not take a dependency on the Chainlink contracts package for one interface.
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @dev Minimal Uniswap V3 pool surface needed for a TWAP observation.
///      Declared locally for the same reason as {IChainlinkAggregator}.
interface IUniswapV3PoolObserver {
    /// @param secondsAgos Seconds before the current block to sample.
    /// @return tickCumulatives Cumulative tick at each requested point.
    /// @return secondsPerLiquidityCumulativeX128 Unused here, part of the ABI.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (
            int56[] memory tickCumulatives,
            uint160[] memory secondsPerLiquidityCumulativeX128
        );
}
