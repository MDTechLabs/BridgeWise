// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPriceOracle, IChainlinkAggregator} from "./IPriceOracle.sol";

/// @title ChainlinkPriceOracle
/// @notice Adapts a Chainlink aggregator to {IPriceOracle}, normalising to 18
///         decimals and rejecting the answers that should never be trusted.
/// @dev Chainlink returns a signed answer and a round id. A non-positive answer
///      and a round that never completed are both real failure modes seen in
///      production, so both are rejected here rather than passed upstream as a
///      number that merely looks plausible.
contract ChainlinkPriceOracle is IPriceOracle {
    IChainlinkAggregator public immutable aggregator;
    uint8 public immutable feedDecimals;
    string private _description;

    error NonPositiveAnswer(int256 answer);
    error IncompleteRound(uint80 roundId, uint80 answeredInRound);
    error UnsupportedDecimals(uint8 decimals);

    constructor(IChainlinkAggregator aggregator_, string memory description_) {
        aggregator = aggregator_;
        uint8 decimals_ = aggregator_.decimals();
        // Above 18 the normalisation below would have to divide and silently
        // lose precision; no mainstream feed exceeds it.
        if (decimals_ > 18) revert UnsupportedDecimals(decimals_);
        feedDecimals = decimals_;
        _description = description_;
    }

    /// @inheritdoc IPriceOracle
    function latestPrice() external view returns (uint256 price, uint256 updatedAt) {
        (uint80 roundId, int256 answer, , uint256 reportedAt, uint80 answeredInRound) =
            aggregator.latestRoundData();

        if (answer <= 0) revert NonPositiveAnswer(answer);
        // A round answered in an earlier round means this one never settled.
        if (answeredInRound < roundId) revert IncompleteRound(roundId, answeredInRound);

        price = uint256(answer) * (10 ** (18 - feedDecimals));
        updatedAt = reportedAt;
    }

    /// @inheritdoc IPriceOracle
    function description() external view returns (string memory) {
        return _description;
    }
}
