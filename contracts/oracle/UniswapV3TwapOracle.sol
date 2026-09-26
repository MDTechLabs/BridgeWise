// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceOracle, IUniswapV3PoolObserver} from "./IPriceOracle.sol";

/// @title UniswapV3TwapOracle
/// @notice Adapts a Uniswap V3 pool's time-weighted average tick to
///         {IPriceOracle}, producing an 18-decimal price.
///
/// @dev A TWAP is used rather than the spot tick because spot is trivially
///      moved within a single block; averaging over a window makes manipulation
///      cost proportional to the window length.
///
///      Tick to price is `1.0001 ^ tick`. Rather than transcribe Uniswap's
///      precomputed TickMath constants, the 1.0001 base is derived from integer
///      arithmetic and raised by exponentiation by squaring. That costs more gas
///      than TickMath but it is auditable by inspection, and the tests pin it
///      against independently computed values.
///
///      Every fixed-point multiply goes through {Math.mulDiv}, which carries a
///      512-bit intermediate. A plain `(a * b) >> 128` overflows uint256 once
///      the squared base passes 2^128, which happens at modest ticks, and the
///      reciprocal `Q128 * Q128` overflows unconditionally.
contract UniswapV3TwapOracle is IPriceOracle {
    /// @dev 2^128, the fixed-point scale used through the exponentiation.
    uint256 private constant Q128 = 1 << 128;

    /// @dev Beyond this the repeated squaring below can overflow. Real pairs
    ///      sit far inside it; Uniswap's own limit is 887272.
    int24 public constant MAX_SUPPORTED_TICK = 400_000;

    IUniswapV3PoolObserver public immutable pool;
    uint32 public immutable twapPeriod;
    /// @dev Decimal difference between the pair, applied after exponentiation.
    int8 public immutable decimalAdjustment;
    string private _description;

    error TwapPeriodZero();
    error TickOutOfRange(int24 tick);
    error ObservationMismatch();

    /// @param pool_               Uniswap V3 pool to observe.
    /// @param twapPeriod_         Averaging window in seconds.
    /// @param decimalAdjustment_  `token0.decimals - token1.decimals`, applied
    ///                            so the result lands on 18 decimals.
    constructor(
        IUniswapV3PoolObserver pool_,
        uint32 twapPeriod_,
        int8 decimalAdjustment_,
        string memory description_
    ) {
        if (twapPeriod_ == 0) revert TwapPeriodZero();
        pool = pool_;
        twapPeriod = twapPeriod_;
        decimalAdjustment = decimalAdjustment_;
        _description = description_;
    }

    /// @inheritdoc IPriceOracle
    /// @dev `updatedAt` is the end of the averaging window, i.e. now. The
    ///      observation is only as fresh as the pool's oldest sample, which the
    ///      pool itself enforces by reverting if the window is not available.
    function latestPrice() external view returns (uint256 price, uint256 updatedAt) {
        price = _priceFromTick(meanTick());
        updatedAt = block.timestamp;
    }

    /// @notice Time-weighted average tick over {twapPeriod}.
    function meanTick() public view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapPeriod;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);
        if (tickCumulatives.length != 2) revert ObservationMismatch();

        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int24 tick = int24(delta / int56(uint56(twapPeriod)));

        // Solidity truncates toward zero; Uniswap's convention rounds down.
        if (delta < 0 && (delta % int56(uint56(twapPeriod)) != 0)) {
            tick -= 1;
        }
        return tick;
    }

    /// @inheritdoc IPriceOracle
    function description() external view returns (string memory) {
        return _description;
    }

    /// @dev `1.0001 ^ tick`, scaled to 18 decimals.
    function _priceFromTick(int24 tick) internal view returns (uint256) {
        if (tick > MAX_SUPPORTED_TICK || tick < -MAX_SUPPORTED_TICK) {
            revert TickOutOfRange(tick);
        }

        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));

        // 1.0001 in Q128. (Q128 * 10001) is ~2^141, comfortably inside uint256,
        // so this is exact to the fixed-point resolution.
        uint256 base = (Q128 * 10001) / 10000;
        uint256 result = Q128;

        while (absTick != 0) {
            if (absTick & 1 == 1) {
                result = Math.mulDiv(result, base, Q128);
            }
            absTick >>= 1;
            if (absTick != 0) {
                base = Math.mulDiv(base, base, Q128);
            }
        }

        // Negative ticks are the reciprocal.
        uint256 priceQ128 = tick < 0 ? Math.mulDiv(Q128, Q128, result) : result;
        uint256 price = Math.mulDiv(priceQ128, 1e18, Q128);

        if (decimalAdjustment > 0) {
            price = price * (10 ** uint8(decimalAdjustment));
        } else if (decimalAdjustment < 0) {
            price = price / (10 ** uint8(-decimalAdjustment));
        }
        return price;
    }
}
