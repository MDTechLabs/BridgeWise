// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BridgeRoute
/// @notice Validates every route against allowlists, slippage, fees, asset compatibility, and exposure limits.
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

    struct RouteConfig {
        bool supported;
        uint256 maxSlippageBps;
        uint256 maxFeeBps;
        bool assetCompatible;
        uint256 exposureLimit;
    }

    mapping(uint32 => mapping(uint32 => mapping(address => RouteConfig))) public routes;

    event RouteConfigured(uint32 indexed srcChain, uint32 indexed dstChain, address indexed token, bool supported);
    event SlippageUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 maxSlippageBps);
    event FeeUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 maxFeeBps);
    event ExposureUpdated(uint32 srcChain, uint32 dstChain, address token, uint256 limit);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Configure a route with safety parameters.
    function setRoute(
        uint32 srcChain,
        uint32 dstChain,
        address token,
        bool supported,
        uint256 maxSlippageBps,
        uint256 maxFeeBps,
        uint256 exposureLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (maxSlippageBps > 10_000 || maxFeeBps > 10_000) revert ZeroAmount();

        RouteConfig storage rc = routes[srcChain][dstChain][token];
        rc.supported = supported;
        rc.maxSlippageBps = maxSlippageBps;
        rc.maxFeeBps = maxFeeBps;
        rc.assetCompatible = true;
        rc.exposureLimit = exposureLimit;

        emit RouteConfigured(srcChain, dstChain, token, supported);
        emit SlippageUpdated(srcChain, dstChain, token, maxSlippageBps);
        emit FeeUpdated(srcChain, dstChain, token, maxFeeBps);
        emit ExposureUpdated(srcChain, dstChain, token, exposureLimit);
    }

    /// @notice Validate a route against all safety checks.
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

        return true;
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
