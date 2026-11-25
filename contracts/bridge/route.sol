// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BridgeRoute
/// @notice Validates every route against allowlists, slippage, fees, asset compatibility,
///         exposure limits, liquidity reserve floors (#1478), atomic route reservations (#1479),
///         and abandoned reservation expiration and balance reconciliation (#1480).
contract BridgeRoute is AccessControl {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error RouteNotSupported(uint32 srcChain, uint32 dstChain, address token);
    error SlippageExceeded(uint256 slippage, uint256 maxSlippage);
    error FeeExceedsLimit(uint256 fee, uint256 maxFee);
    error AssetIncompatible(address token);
    error ExposureExceeded(address token, uint256 exposure, uint256 limit);

    // Issue #1478, #1479, #1480 errors
    error ReserveFloorBreached(uint256 available, uint256 requested, uint256 reserveFloor);
    error LiquidityOversubscribed(uint256 available, uint256 requested, uint256 reserveFloor);
    error ReservationAlreadyExists(bytes32 reservationId);
    error ReservationNotFound(bytes32 reservationId);
    error ReservationAlreadyCompleted(bytes32 reservationId);
    error ReservationAlreadyReleased(bytes32 reservationId);
    error ReservationExpiredError(bytes32 reservationId, uint64 expiresAt);
    error ReservationNotExpired(bytes32 reservationId, uint64 expiresAt);
    error InvalidReservationDuration(uint32 duration, uint32 minDuration, uint32 maxDuration);
    error InsolventLiquidity(uint256 physicalBalance, uint256 reservedLiquidity, uint256 reserveFloor);
    error FloorExceedsExposure(uint256 reserveFloor, uint256 exposureLimit);

    struct RouteConfig {
        bool supported;
        uint256 maxSlippageBps;
        uint256 maxFeeBps;
        bool assetCompatible;
        uint256 exposureLimit;
        uint256 reserveFloor;          // Minimum liquidity reserve floor (Issue #1478)
        uint32 minReservationDuration; // Minimum reservation TTL seconds
        uint32 maxReservationDuration; // Maximum reservation TTL seconds
    }

    struct LiquidityReservation {
        bytes32 reservationId;
        address requester;
        uint32 srcChain;
        uint32 dstChain;
        address token;
        uint256 amount;
        uint64 createdAt;
        uint64 expiresAt;
        bool completed;
        bool released;
    }

    // srcChain => dstChain => token => RouteConfig
    mapping(uint32 => mapping(uint32 => mapping(address => RouteConfig))) public routes;

    // srcChain => dstChain => token => totalLiquidity
    mapping(uint32 => mapping(uint32 => mapping(address => uint256))) public routeLiquidity;

    // srcChain => dstChain => token => reservedLiquidity
    mapping(uint32 => mapping(uint32 => mapping(address => uint256))) public routeReservedLiquidity;

    // reservationId => LiquidityReservation
    mapping(bytes32 => LiquidityReservation) public reservations;

    event RouteConfigured(uint32 indexed srcChain, uint32 indexed dstChain, address indexed token, bool supported);
    event SlippageUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 maxSlippageBps);
    event FeeUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 maxFeeBps);
    event ExposureUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 limit);
    event ReserveFloorUpdated(uint32 indexed srcChain, uint32 indexed dstChain, address indexed token, uint256 reserveFloor);
    event LiquidityUpdated(uint32 indexed srcChain, uint32 indexed dstChain, address indexed token, uint256 totalLiquidity);
    event LiquidityReserved(bytes32 indexed reservationId, address indexed requester, uint32 srcChain, uint32 dstChain, address token, uint256 amount, uint64 expiresAt);
    event ReservationConsumed(bytes32 indexed reservationId, address indexed requester, address indexed token, uint256 amount);
    event ReservationExpired(bytes32 indexed reservationId, address indexed token, uint256 amount, uint64 timestamp);
    event ReservationReleased(bytes32 indexed reservationId, address indexed requester, address indexed token, uint256 amount);
    event LiquidityReconciled(uint32 indexed srcChain, uint32 indexed dstChain, address indexed token, uint256 recordedLiquidity, uint256 physicalBalance, int256 drift);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Configure a route with safety parameters (backward-compatible 7-arg overload).
    function setRoute(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        bool supported,
        uint256 maxSlippageBps,
        uint256 maxFeeBps,
        uint256 exposureLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        setRoute(srcChain, dstChain, token, supported, maxSlippageBps, maxFeeBps, exposureLimit, 0, 30, 3600);
    }

    /// @notice Configure a route with reserve floor and reservation duration parameters.
    function setRoute(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        bool supported,
        uint256 maxSlippageBps,
        uint256 maxFeeBps,
        uint256 exposureLimit,
        uint256 reserveFloor
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        setRoute(srcChain, dstChain, token, supported, maxSlippageBps, maxFeeBps, exposureLimit, reserveFloor, 30, 3600);
    }

    /// @notice Full configuration for a route including reserve floor and reservation TTL bounds.
    function setRoute(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        bool supported,
        uint256 maxSlippageBps,
        uint256 maxFeeBps,
        uint256 exposureLimit,
        uint256 reserveFloor,
        uint32 minDuration,
        uint32 maxDuration
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (maxSlippageBps > 10_000 || maxFeeBps > 10_000) revert ZeroAmount();
        if (exposureLimit > 0 && reserveFloor > exposureLimit) {
            revert FloorExceedsExposure(reserveFloor, exposureLimit);
        }

        RouteConfig storage rc = routes[srcChain][dstChain][token];
        rc.supported = supported;
        rc.maxSlippageBps = maxSlippageBps;
        rc.maxFeeBps = maxFeeBps;
        rc.assetCompatible = true;
        rc.exposureLimit = exposureLimit;
        rc.reserveFloor = reserveFloor;
        rc.minReservationDuration = minDuration == 0 ? 30 : minDuration;
        rc.maxReservationDuration = maxDuration == 0 ? 3600 : maxDuration;

        emit RouteConfigured(srcChain, dstChain, token, supported);
        emit SlippageUpdated(srcChain, dstChain, token, maxSlippageBps);
        emit FeeUpdated(srcChain, dstChain, token, maxFeeBps);
        emit ExposureUpdated(srcChain, dstChain, token, exposureLimit);
        emit ReserveFloorUpdated(srcChain, dstChain, token, reserveFloor);
    }

    /// @notice Updates the tracked pool liquidity for a route.
    function updateLiquidity(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        uint256 totalLiquidity
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        RouteConfig memory rc = routes[srcChain][dstChain][token];
        uint256 reserved = routeReservedLiquidity[srcChain][dstChain][token];
        if (totalLiquidity < reserved + rc.reserveFloor) {
            revert InsolventLiquidity(totalLiquidity, reserved, rc.reserveFloor);
        }

        routeLiquidity[srcChain][dstChain][token] = totalLiquidity;
        emit LiquidityUpdated(srcChain, dstChain, token, totalLiquidity);
    }

    /// @notice Validate a route against all safety checks and reserve floor (Issue #1478).
    function validateRoute(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        uint256 amount,
        uint256 expectedAmount,
        uint256 fee
    ) external view returns (bool valid) {
        RouteConfig memory rc = routes[srcChain][dstChain][token];
        if (!rc.supported) {
            revert RouteNotSupported(srcChain, dstChain, token);
        }
        if (!rc.assetCompatible) {
            revert AssetIncompatible(token);
        }

        if (amount > 0 && expectedAmount < amount) {
            uint256 slippage = ((amount - expectedAmount) * 10_000) / amount;
            if (slippage > rc.maxSlippageBps) {
                revert SlippageExceeded(slippage, rc.maxSlippageBps);
            }
        }

        if (amount > 0) {
            uint256 feeBps = (fee * 10_000) / amount;
            if (feeBps > rc.maxFeeBps) {
                revert FeeExceedsLimit(feeBps, rc.maxFeeBps);
            }
        }

        // Reserve floor enforcement (Issue #1478)
        uint256 total = routeLiquidity[srcChain][dstChain][token];
        if (total > 0 || rc.reserveFloor > 0) {
            uint256 reserved = routeReservedLiquidity[srcChain][dstChain][token];
            uint256 available = total >= reserved ? total - reserved : 0;
            if (available < amount || (available - amount) < rc.reserveFloor) {
                revert ReserveFloorBreached(available, amount, rc.reserveFloor);
            }
        }

        return true;
    }

    /// @notice Atomically reserves liquidity for a route, preventing concurrent oversubscription (Issue #1479).
    function reserveLiquidity(
        bytes32 reservationId,
        uint32 srcChain,
        uint32 dstChain,
        address token,
        uint256 amount,
        uint32 durationSeconds
    ) external returns (bytes32) {
        if (reservationId == bytes32(0)) revert ZeroAmount();
        if (reservations[reservationId].createdAt != 0) {
            revert ReservationAlreadyExists(reservationId);
        }
        if (amount == 0) revert ZeroAmount();

        RouteConfig memory rc = routes[srcChain][dstChain][token];
        if (!rc.supported) revert RouteNotSupported(srcChain, dstChain, token);
        if (!rc.assetCompatible) revert AssetIncompatible(token);

        uint32 minDur = rc.minReservationDuration == 0 ? 30 : rc.minReservationDuration;
        uint32 maxDur = rc.maxReservationDuration == 0 ? 3600 : rc.maxReservationDuration;
        if (durationSeconds < minDur || durationSeconds > maxDur) {
            revert InvalidReservationDuration(durationSeconds, minDur, maxDur);
        }

        uint256 total = routeLiquidity[srcChain][dstChain][token];
        uint256 reserved = routeReservedLiquidity[srcChain][dstChain][token];
        uint256 available = total >= reserved ? total - reserved : 0;

        if (available < amount || (available - amount) < rc.reserveFloor) {
            revert LiquidityOversubscribed(available, amount, rc.reserveFloor);
        }

        // Atomically increment reserved liquidity
        routeReservedLiquidity[srcChain][dstChain][token] = reserved + amount;
        uint64 expiresAt = uint64(block.timestamp + durationSeconds);

        reservations[reservationId] = LiquidityReservation({
            reservationId: reservationId,
            requester: msg.sender,
            srcChain: srcChain,
            dstChain: dstChain,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            completed: false,
            released: false
        });

        emit LiquidityReserved(reservationId, msg.sender, srcChain, dstChain, token, amount, expiresAt);
        return reservationId;
    }

    /// @notice Consumes an active reservation when transfer executes.
    function consumeReservation(bytes32 reservationId) external {
        LiquidityReservation storage res = reservations[reservationId];
        if (res.createdAt == 0) revert ReservationNotFound(reservationId);
        if (res.completed) revert ReservationAlreadyCompleted(reservationId);
        if (res.released) revert ReservationAlreadyReleased(reservationId);
        if (block.timestamp > res.expiresAt) {
            revert ReservationExpiredError(reservationId, res.expiresAt);
        }
        if (msg.sender != res.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }

        res.completed = true;
        routeReservedLiquidity[res.srcChain][res.dstChain][res.token] -= res.amount;
        routeLiquidity[res.srcChain][res.dstChain][res.token] -= res.amount;

        emit ReservationConsumed(reservationId, res.requester, res.token, res.amount);
    }

    /// @notice Permissionlessly expires an abandoned reservation past its TTL (Issue #1480).
    function expireReservation(bytes32 reservationId) public returns (bool) {
        LiquidityReservation storage res = reservations[reservationId];
        if (res.createdAt == 0) revert ReservationNotFound(reservationId);
        if (res.completed || res.released) return false;
        if (block.timestamp <= res.expiresAt && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert ReservationNotExpired(reservationId, res.expiresAt);
        }

        res.released = true;
        routeReservedLiquidity[res.srcChain][res.dstChain][res.token] -= res.amount;

        emit ReservationExpired(reservationId, res.token, res.amount, uint64(block.timestamp));
        return true;
    }

    /// @notice Batch expires multiple abandoned reservations in a single transaction (Issue #1480).
    function expireReservations(bytes32[] calldata reservationIds) external returns (uint256 expiredCount) {
        for (uint256 i = 0; i < reservationIds.length; i++) {
            bytes32 id = reservationIds[i];
            LiquidityReservation storage res = reservations[id];
            if (res.createdAt != 0 && !res.completed && !res.released && block.timestamp > res.expiresAt) {
                res.released = true;
                routeReservedLiquidity[res.srcChain][res.dstChain][res.token] -= res.amount;
                emit ReservationExpired(id, res.token, res.amount, uint64(block.timestamp));
                expiredCount++;
            }
        }
    }

    /// @notice Early release of a reservation by the requester before expiry.
    function releaseReservation(bytes32 reservationId) external {
        LiquidityReservation storage res = reservations[reservationId];
        if (res.createdAt == 0) revert ReservationNotFound(reservationId);
        if (res.completed) revert ReservationAlreadyCompleted(reservationId);
        if (res.released) revert ReservationAlreadyReleased(reservationId);
        if (msg.sender != res.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }

        res.released = true;
        routeReservedLiquidity[res.srcChain][res.dstChain][res.token] -= res.amount;

        emit ReservationReleased(reservationId, res.requester, res.token, res.amount);
    }

    /// @notice Reconciles recorded liquidity with actual physical balance (Issue #1480).
    function reconcileLiquidity(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        uint256 physicalBalance
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (int256 drift) {
        RouteConfig memory rc = routes[srcChain][dstChain][token];
        uint256 reserved = routeReservedLiquidity[srcChain][dstChain][token];
        if (physicalBalance < reserved + rc.reserveFloor) {
            revert InsolventLiquidity(physicalBalance, reserved, rc.reserveFloor);
        }

        uint256 recorded = routeLiquidity[srcChain][dstChain][token];
        drift = int256(physicalBalance) - int256(recorded);
        routeLiquidity[srcChain][dstChain][token] = physicalBalance;

        emit LiquidityReconciled(srcChain, dstChain, token, recorded, physicalBalance, drift);
    }

    /// @notice Check if a route is supported.
    function isRouteSupported(uint32 srcChain, uint32 dstChain, address token) external view returns (bool) {
        return routes[srcChain][dstChain][token].supported;
    }

    /// @notice Update asset compatibility for a token.
    function setAssetCompatible(uint32 srcChain, uint32 dstChain, address token, bool compatible) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        routes[srcChain][dstChain][token].assetCompatible = compatible;
    }
}
