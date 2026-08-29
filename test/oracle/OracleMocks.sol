// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPriceOracle, IChainlinkAggregator, IUniswapV3PoolObserver} from "../../contracts/oracle/IPriceOracle.sol";

/// @dev A controllable {IPriceOracle} for exercising the aggregator directly.
contract MockPriceOracle is IPriceOracle {
    uint256 private _price;
    uint256 private _updatedAt;
    bool private _shouldRevert;
    string private _description;

    error MockOracleFailure();

    constructor(uint256 price_, uint256 updatedAt_, string memory description_) {
        _price = price_;
        _updatedAt = updatedAt_;
        _description = description_;
    }

    function setPrice(uint256 price_) external {
        _price = price_;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        _updatedAt = updatedAt_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        _shouldRevert = shouldRevert_;
    }

    function latestPrice() external view returns (uint256, uint256) {
        if (_shouldRevert) revert MockOracleFailure();
        return (_price, _updatedAt);
    }

    function description() external view returns (string memory) {
        return _description;
    }
}

/// @dev Minimal controllable Chainlink aggregator.
contract MockChainlinkAggregator is IChainlinkAggregator {
    uint8 private immutable _decimals;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId = 1;
    uint80 private _answeredInRound = 1;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        _decimals = decimals_;
        _answer = answer_;
        _updatedAt = updatedAt_;
    }

    function setAnswer(int256 answer_) external {
        _answer = answer_;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        _updatedAt = updatedAt_;
    }

    /// @dev Drives the incomplete-round path: answeredInRound < roundId.
    function setRounds(uint80 roundId_, uint80 answeredInRound_) external {
        _roundId = roundId_;
        _answeredInRound = answeredInRound_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _answeredInRound);
    }
}

/// @dev Uniswap V3 pool stub returning tick cumulatives that imply a chosen
///      mean tick over the requested window.
contract MockUniswapV3Pool is IUniswapV3PoolObserver {
    int56 private _startCumulative;
    int24 private _meanTick;

    constructor(int24 meanTick_) {
        _meanTick = meanTick_;
    }

    function setMeanTick(int24 meanTick_) external {
        _meanTick = meanTick_;
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityX128)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityX128 = new uint160[](secondsAgos.length);

        // tickCumulatives[1] - tickCumulatives[0] == meanTick * period
        int56 span = int56(int32(secondsAgos[0])) - int56(int32(secondsAgos[1]));
        tickCumulatives[0] = _startCumulative;
        tickCumulatives[1] = _startCumulative + int56(_meanTick) * span;
    }
}
