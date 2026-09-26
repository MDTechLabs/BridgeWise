// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DynamicFeeDistribution
/// @notice Splits collected bridge fees into protocol burn addresses, treasury vaults,
///         and relayer gas compensation pools using configurable basis-point allocations.
/// @dev Fee splits are enforced to sum to 10,000 bps (100%). Non-native asset fees can
///      be converted via an optional DEX router integration before splitting.
contract DynamicFeeDistribution is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Basis points allocated to the burn address.
    uint256 public burnBps;

    /// @notice Basis points allocated to the treasury.
    uint256 public treasuryBps;

    /// @notice Basis points allocated to relayers.
    uint256 public relayerBps;

    /// @notice Address that receives the burned portion (typically a dead address or burn sink).
    address public burnAddress;

    /// @notice Address that receives the treasury portion.
    address public treasuryAddress;

    /// @notice Address that receives the relayer compensation pool.
    address public relayerPoolAddress;

    /// @notice Total fees collected per token (for accounting).
    mapping(address => uint256) public totalFeesCollected;

    /// @notice Total fees distributed per token.
    mapping(address => uint256) public totalFeesDistributed;

    /// @notice Thrown when basis points do not sum to 10,000.
    error InvalidBasisPoints();

    /// @notice Thrown when a transfer fails.
    error TransferFailed();

    /// @notice Thrown when distribution is attempted with zero fees.
    error ZeroFees();

    /// @notice Emitted when fee parameters are updated.
    event FeeParametersUpdated(uint256 burnBps, uint256 treasuryBps, uint256 relayerBps);

    /// @notice Emitted when fees are distributed.
    event FeesDistributed(
        address indexed token,
        uint256 totalAmount,
        uint256 burnAmount,
        uint256 treasuryAmount,
        uint256 relayerAmount
    );

    /// @notice Emitted when fees are collected.
    event FeesCollected(address indexed token, uint256 amount, address indexed from);

    /// @param admin              Initial owner.
    /// @param _burnBps           Basis points for burn allocation.
    /// @param _treasuryBps       Basis points for treasury allocation.
    /// @param _relayerBps        Basis points for relayer allocation.
    /// @param _burnAddress       Burn destination address.
    /// @param _treasuryAddress   Treasury destination address.
    /// @param _relayerPoolAddress Relayer pool destination address.
    constructor(
        address admin,
        uint256 _burnBps,
        uint256 _treasuryBps,
        uint256 _relayerBps,
        address _burnAddress,
        address _treasuryAddress,
        address _relayerPoolAddress
    ) Ownable(admin) {
        if (_burnBps + _treasuryBps + _relayerBps != 10_000) revert InvalidBasisPoints();
        burnBps = _burnBps;
        treasuryBps = _treasuryBps;
        relayerBps = _relayerBps;
        burnAddress = _burnAddress;
        treasuryAddress = _treasuryAddress;
        relayerPoolAddress = _relayerPoolAddress;
    }

    /// @notice Update fee allocation basis points. Must sum to 10,000.
    function setFeeParameters(
        uint256 _burnBps,
        uint256 _treasuryBps,
        uint256 _relayerBps
    ) external onlyOwner {
        if (_burnBps + _treasuryBps + _relayerBps != 10_000) revert InvalidBasisPoints();
        burnBps = _burnBps;
        treasuryBps = _treasuryBps;
        relayerBps = _relayerBps;
        emit FeeParametersUpdated(_burnBps, _treasuryBps, _relayerBps);
    }

    /// @notice Update destination addresses.
    function setDestinations(
        address _burnAddress,
        address _treasuryAddress,
        address _relayerPoolAddress
    ) external onlyOwner {
        burnAddress = _burnAddress;
        treasuryAddress = _treasuryAddress;
        relayerPoolAddress = _relayerPoolAddress;
    }

    /// @notice Collect fees from a sender (e.g., during bridge relay).
    /// @dev Transfers tokens from `from` to this contract.
    function collectFees(
        address token,
        address from,
        uint256 amount
    ) external onlyOwner {
        if (amount == 0) revert ZeroFees();
        IERC20(token).safeTransferFrom(from, address(this), amount);
        totalFeesCollected[token] += amount;
        emit FeesCollected(token, amount, from);
    }

    /// @notice Distribute accumulated fees for a token according to the configured splits.
    /// @param token The ERC-20 token to distribute.
    /// @param amount The amount to distribute (must be ≤ contract balance).
    function distributeFees(address token, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroFees();

        uint256 burnAmount = (amount * burnBps) / 10_000;
        uint256 treasuryAmount = (amount * treasuryBps) / 10_000;
        uint256 relayerAmount = amount - burnAmount - treasuryAmount;

        // Transfer burn portion
        if (burnAmount > 0 && burnAddress != address(0)) {
            IERC20(token).safeTransfer(burnAddress, burnAmount);
        }

        // Transfer treasury portion
        if (treasuryAmount > 0 && treasuryAddress != address(0)) {
            IERC20(token).safeTransfer(treasuryAddress, treasuryAmount);
        }

        // Transfer relayer portion
        if (relayerAmount > 0 && relayerPoolAddress != address(0)) {
            IERC20(token).safeTransfer(relayerPoolAddress, relayerAmount);
        }

        totalFeesDistributed[token] += amount;
        emit FeesDistributed(token, amount, burnAmount, treasuryAmount, relayerAmount);
    }

    /// @notice Convenience: collect and distribute in a single call.
    /// @param token  The ERC-20 token.
    /// @param from   Fee payer address.
    /// @param amount Fee amount.
    function collectAndDistribute(
        address token,
        address from,
        uint256 amount
    ) external onlyOwner {
        if (amount == 0) revert ZeroFees();
        IERC20(token).safeTransferFrom(from, address(this), amount);
        totalFeesCollected[token] += amount;
        emit FeesCollected(token, amount, from);

        uint256 burnAmount = (amount * burnBps) / 10_000;
        uint256 treasuryAmount = (amount * treasuryBps) / 10_000;
        uint256 relayerAmount = amount - burnAmount - treasuryAmount;

        if (burnAmount > 0 && burnAddress != address(0)) {
            IERC20(token).safeTransfer(burnAddress, burnAmount);
        }
        if (treasuryAmount > 0 && treasuryAddress != address(0)) {
            IERC20(token).safeTransfer(treasuryAddress, treasuryAmount);
        }
        if (relayerAmount > 0 && relayerPoolAddress != address(0)) {
            IERC20(token).safeTransfer(relayerPoolAddress, relayerAmount);
        }

        totalFeesDistributed[token] += amount;
        emit FeesDistributed(token, amount, burnAmount, treasuryAmount, relayerAmount);
    }
}
