// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPriceOracle} from "./IPriceOracle.sol";

/// @title BridgeMultiOracle
/// @notice Aggregates two independent price sources and refuses to value a
///         transfer when they disagree by more than a configured margin.
///
/// @dev A single feed is a single point of failure: a manipulated spot pool or
///      a Chainlink feed stuck on stale data will happily report a price that
///      lets an attacker over-withdraw on the far side of a bridge. Requiring
///      two independent sources to agree turns that from a silent mispricing
///      into a revert.
///
///      Two deliberate choices, both aimed at failing safe:
///
///      1. Deviation is measured against the **smaller** of the two prices, so
///         the same absolute gap always yields the larger percentage. A check
///         against the mean would under-report exactly when the feeds diverge
///         most.
///      2. Valuation returns the **higher** of the two prices. This contract
///         gates on a high-value threshold, so overstating value routes more
///         transfers into the stricter path. Understating it would let a large
///         transfer slip underneath the threshold, which is the failure that
///         actually costs money.
contract BridgeMultiOracle {
    /// @dev Basis-point denominator. 10_000 bps == 100%.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Upper bound on the configurable deviation, so a misconfiguration
    ///      cannot disable the check entirely.
    uint256 public constant MAX_CONFIGURABLE_DEVIATION_BPS = 5_000;

    /// @notice The two price sources being compared.
    IPriceOracle public primaryOracle;
    IPriceOracle public fallbackOracle;

    /// @notice Maximum tolerated disagreement, in basis points. 200 == 2%.
    uint256 public maxDeviationBps;

    /// @notice Observations older than this are treated as unusable.
    uint256 public maxPriceAge;

    /// @notice Transfer value, in 18-decimal USD, at or above which both
    ///         oracles must agree before the transfer may proceed.
    uint256 public highValueThreshold;

    address public owner;

    /// @notice Raised when the two feeds disagree by more than {maxDeviationBps}.
    error OracleDeviationExceeded(uint256 deviationBps, uint256 maxDeviationBps);
    /// @notice A feed reported an observation older than {maxPriceAge}.
    error StalePrice(address oracle, uint256 updatedAt, uint256 maxAge);
    /// @notice A feed reported a non-positive or zero price.
    error InvalidPrice(address oracle);
    /// @notice Configuration rejected: zero address, or a deviation above the cap.
    error InvalidConfiguration();
    /// @notice Caller is not the owner.
    error Unauthorized();

    event OraclesUpdated(address indexed primary, address indexed fallbackOracle);
    event DeviationThresholdUpdated(uint256 maxDeviationBps);
    event HighValueThresholdUpdated(uint256 highValueThreshold);
    event MaxPriceAgeUpdated(uint256 maxPriceAge);
    event OwnershipTransferred(address indexed from, address indexed to);
    event HighValueTransferValidated(uint256 valueUsd, uint256 price, uint256 deviationBps);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        IPriceOracle primaryOracle_,
        IPriceOracle fallbackOracle_,
        uint256 maxDeviationBps_,
        uint256 maxPriceAge_,
        uint256 highValueThreshold_
    ) {
        if (
            address(primaryOracle_) == address(0) ||
            address(fallbackOracle_) == address(0) ||
            address(primaryOracle_) == address(fallbackOracle_) ||
            maxDeviationBps_ == 0 ||
            maxDeviationBps_ > MAX_CONFIGURABLE_DEVIATION_BPS ||
            maxPriceAge_ == 0
        ) {
            revert InvalidConfiguration();
        }

        primaryOracle = primaryOracle_;
        fallbackOracle = fallbackOracle_;
        maxDeviationBps = maxDeviationBps_;
        maxPriceAge = maxPriceAge_;
        highValueThreshold = highValueThreshold_;
        owner = msg.sender;

        emit OraclesUpdated(address(primaryOracle_), address(fallbackOracle_));
        emit DeviationThresholdUpdated(maxDeviationBps_);
        emit MaxPriceAgeUpdated(maxPriceAge_);
        emit HighValueThresholdUpdated(highValueThreshold_);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    /// @notice Read both feeds and return an agreed price.
    /// @dev Reverts if either feed is stale or non-positive, or if the two
    ///      disagree by more than {maxDeviationBps}.
    /// @return price        The higher of the two prices, 18 decimals.
    /// @return deviation    Observed disagreement in basis points.
    function getValidatedPrice() public view returns (uint256 price, uint256 deviation) {
        uint256 primaryPrice = _readOracle(primaryOracle);
        uint256 fallbackPrice = _readOracle(fallbackOracle);

        deviation = calculateDeviationBps(primaryPrice, fallbackPrice);
        if (deviation > maxDeviationBps) {
            revert OracleDeviationExceeded(deviation, maxDeviationBps);
        }

        price = primaryPrice > fallbackPrice ? primaryPrice : fallbackPrice;
    }

    /// @notice Value a transfer and enforce cross-oracle agreement when it is
    ///         large enough to matter.
    ///
    /// @dev Below the threshold the primary feed alone is used, which keeps
    ///      routine transfers cheap. At or above it, both feeds must agree.
    ///      Note the value is computed from the primary price first purely to
    ///      classify the transfer; once classified as high value, the returned
    ///      price comes from {getValidatedPrice}.
    ///
    /// @param amount        Asset amount, 18 decimals.
    /// @return valueUsd     Transfer value in 18-decimal USD.
    /// @return price        Price used, 18 decimals.
    /// @return isHighValue  Whether the stricter path was taken.
    function validateTransfer(uint256 amount)
        external
        view
        returns (uint256 valueUsd, uint256 price, bool isHighValue)
    {
        uint256 primaryPrice = _readOracle(primaryOracle);
        uint256 provisionalValue = (amount * primaryPrice) / 1e18;

        if (provisionalValue < highValueThreshold) {
            return (provisionalValue, primaryPrice, false);
        }

        (price, ) = getValidatedPrice();
        valueUsd = (amount * price) / 1e18;
        isHighValue = true;
    }

    /// @notice Disagreement between two prices, in basis points.
    /// @dev Measured against the smaller price so the figure is never flattered
    ///      by the larger one. Two equal prices yield 0; a zero input yields the
    ///      maximum, since no meaningful comparison exists.
    function calculateDeviationBps(uint256 a, uint256 b) public pure returns (uint256) {
        if (a == 0 || b == 0) return type(uint256).max;
        if (a == b) return 0;

        (uint256 lower, uint256 higher) = a < b ? (a, b) : (b, a);
        return ((higher - lower) * BPS_DENOMINATOR) / lower;
    }

    /// @notice Whether both feeds currently agree closely enough to transact.
    /// @dev Never reverts, so callers can branch instead of using try/catch.
    function oraclesAgree() external view returns (bool) {
        (bool okPrimary, uint256 primaryPrice) = _tryReadOracle(primaryOracle);
        (bool okFallback, uint256 fallbackPrice) = _tryReadOracle(fallbackOracle);
        if (!okPrimary || !okFallback) return false;

        return calculateDeviationBps(primaryPrice, fallbackPrice) <= maxDeviationBps;
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setOracles(IPriceOracle primaryOracle_, IPriceOracle fallbackOracle_)
        external
        onlyOwner
    {
        if (
            address(primaryOracle_) == address(0) ||
            address(fallbackOracle_) == address(0) ||
            address(primaryOracle_) == address(fallbackOracle_)
        ) {
            revert InvalidConfiguration();
        }
        primaryOracle = primaryOracle_;
        fallbackOracle = fallbackOracle_;
        emit OraclesUpdated(address(primaryOracle_), address(fallbackOracle_));
    }

    function setMaxDeviationBps(uint256 maxDeviationBps_) external onlyOwner {
        if (maxDeviationBps_ == 0 || maxDeviationBps_ > MAX_CONFIGURABLE_DEVIATION_BPS) {
            revert InvalidConfiguration();
        }
        maxDeviationBps = maxDeviationBps_;
        emit DeviationThresholdUpdated(maxDeviationBps_);
    }

    function setMaxPriceAge(uint256 maxPriceAge_) external onlyOwner {
        if (maxPriceAge_ == 0) revert InvalidConfiguration();
        maxPriceAge = maxPriceAge_;
        emit MaxPriceAgeUpdated(maxPriceAge_);
    }

    function setHighValueThreshold(uint256 highValueThreshold_) external onlyOwner {
        highValueThreshold = highValueThreshold_;
        emit HighValueThresholdUpdated(highValueThreshold_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfiguration();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _readOracle(IPriceOracle oracle) private view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = oracle.latestPrice();

        if (price == 0) revert InvalidPrice(address(oracle));
        // A timestamp in the future is as untrustworthy as one long past.
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) {
            revert StalePrice(address(oracle), updatedAt, maxPriceAge);
        }
    }

    /// @dev Non-reverting variant backing {oraclesAgree}.
    function _tryReadOracle(IPriceOracle oracle) private view returns (bool ok, uint256 price) {
        try oracle.latestPrice() returns (uint256 reported, uint256 updatedAt) {
            if (reported == 0) return (false, 0);
            if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) {
                return (false, 0);
            }
            return (true, reported);
        } catch {
            return (false, 0);
        }
    }
}
