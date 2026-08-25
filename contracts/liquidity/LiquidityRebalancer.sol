// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LiquidityRebalancer
 * @notice Dynamic multi-chain liquidity rebalancing engine. Tracks target reserve
 *         ratios in packed 256-bit storage words and executes low-level cross-chain
 *         rebalance requests when imbalance exceeds configured bounds.
 * @dev Hot paths (pack/unpack, ratio math, bridge dispatch) use Yul to keep
 *      per-step gas overhead low — typically one SLOAD/SSTORE per chain update.
 *
 * Packed chain slot layout (256 bits):
 *   [0-127]   : reserve          (uint128) — current tracked liquidity
 *   [128-159] : targetRatioBps   (uint32)  — target share of total liquidity (bps)
 *   [160-191] : imbalanceBoundBps (uint32)  — max allowed |current - target| in bps
 *   [192-255] : flags            (uint64)  — bit0 = active
 */
contract LiquidityRebalancer {
    /// @notice Basis-point denominator (100% = 10_000).
    uint256 public constant BPS = 10_000;

    /// @notice Packed per-chain liquidity config + reserve.
    mapping(uint256 => uint256) public chainData;

    /// @notice Ordered list of registered destination chain ids.
    uint256[] public connectedChains;

    /// @notice Aggregate tracked reserves across all active chains.
    uint256 public totalReserves;

    /// @notice Destination that receives low-level cross-chain rebalance calls.
    address public bridgeRouter;

    /// @notice Contract owner (admin).
    address public owner;


      /// @notice Contract owner (updateReserve).
    address private owner;

    event ChainConfigured(
        uint256 indexed chainId,
        uint32 targetRatioBps,
        uint32 imbalanceBoundBps
    );
    event ReserveUpdated(uint256 indexed chainId, uint128 oldReserve, uint128 newReserve);
    event ImbalanceDetected(
        uint256 indexed chainId,
        uint256 currentRatioBps,
        uint32 targetRatioBps,
        uint256 skewBps
    );
    event RebalanceRequested(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        uint128 amount,
        bool success
    );

    error Unauthorized();
    error InvalidTargetRatio();
    error InvalidBound();
    error ChainNotActive(uint256 chainId);
    error InvalidRouter();
    error InsufficientReserve(uint256 chainId);
    error NotImbalanced(uint256 chainId);
    error LengthMismatch();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address router_) {
        if (router_ == address(0)) revert InvalidRouter();
        owner = msg.sender;
        bridgeRouter = router_;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Register or update a destination chain with packed target ratio + bound.
    function configureChain(
        uint256 chainId,
        uint32 targetRatioBps,
        uint32 imbalanceBoundBps
    ) external onlyOwner {
        if (targetRatioBps == 0 || targetRatioBps > BPS) revert InvalidTargetRatio();
        if (imbalanceBoundBps == 0 || imbalanceBoundBps > BPS) revert InvalidBound();

        bool wasActive = _isActive(chainId);

        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            let slot := keccak256(0x00, 0x40)
            let existing := sload(slot)
            let reserve := and(existing, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            // pack: reserve | target<<128 | bound<<160 | active(1)<<192
            let packed := or(
                reserve,
                or(
                    shl(128, targetRatioBps),
                    or(shl(160, imbalanceBoundBps), shl(192, 1))
                )
            )
            sstore(slot, packed)
        }

        if (!wasActive) {
            connectedChains.push(chainId);
        }

        emit ChainConfigured(chainId, targetRatioBps, imbalanceBoundBps);
    }

    /// @notice Update the bridge router used for low-level rebalance calls.
    function setBridgeRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert InvalidRouter();
        bridgeRouter = router_;
    }

    // -------------------------------------------------------------------------
    // Reserve tracking (packed storage)
    // -------------------------------------------------------------------------

    /// @notice Report the latest reserve for `chainId`. Emits ImbalanceDetected
    ///         when |currentRatio - target| exceeds the packed imbalance bound.
    function updateReserve(uint256 chainId, uint128 newReserve) external onlyOwner {
        if (!_isActive(chainId)) revert ChainNotActive(chainId);

        uint128 oldReserve;
        uint32 targetRatioBps;
        uint32 imbalanceBoundBps;

        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            let slot := keccak256(0x00, 0x40)
            let data := sload(slot)

            oldReserve := and(data, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            targetRatioBps := and(shr(128, data), 0xFFFFFFFF)
            imbalanceBoundBps := and(shr(160, data), 0xFFFFFFFF)

            let packed := or(
                newReserve,
                or(
                    shl(128, targetRatioBps),
                    or(shl(160, imbalanceBoundBps), shl(192, 1))
                )
            )
            sstore(slot, packed)
        }

        totalReserves = totalReserves - uint256(oldReserve) + uint256(newReserve);
        emit ReserveUpdated(chainId, oldReserve, newReserve);

        uint256 skew = skewBps(chainId);
        if (skew > imbalanceBoundBps) {
            emit ImbalanceDetected(chainId, currentRatioBps(chainId), targetRatioBps, skew);
        }
    }

    // -------------------------------------------------------------------------
    // Views — packed decode + imbalance math in Yul
    // -------------------------------------------------------------------------

    /// @notice Unpack packed chain state.
    function getChainState(uint256 chainId)
        external
        view
        returns (uint128 reserve, uint32 targetRatioBps, uint32 imbalanceBoundBps, bool active)
    {
        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            let data := sload(keccak256(0x00, 0x40))
            reserve := and(data, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            targetRatioBps := and(shr(128, data), 0xFFFFFFFF)
            imbalanceBoundBps := and(shr(160, data), 0xFFFFFFFF)
            active := and(shr(192, data), 0x1)
        }
    }

    /// @notice Current reserve share of total liquidity in basis points.
    function currentRatioBps(uint256 chainId) public view returns (uint256 ratio) {
        uint256 total = totalReserves;
        if (total == 0) return 0;

        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            let reserve := and(sload(keccak256(0x00, 0x40)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            ratio := div(mul(reserve, 10000), total)
        }
    }

    /// @notice Absolute deviation of current ratio from the packed target (bps).
    function skewBps(uint256 chainId) public view returns (uint256 skew) {
        uint256 current = currentRatioBps(chainId);
        uint256 target;
        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            target := and(shr(128, sload(keccak256(0x00, 0x40))), 0xFFFFFFFF)
        }
        skew = current >= target ? current - target : target - current;
    }

    /// @notice True when skew exceeds the chain's packed imbalance bound.
    function isImbalanced(uint256 chainId) public view returns (bool) {
        if (!_isActive(chainId)) return false;
        uint32 bound;
        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            bound := and(shr(160, sload(keccak256(0x00, 0x40))), 0xFFFFFFFF)
        }
        return skewBps(chainId) > bound;
    }

    /// @notice Number of connected chains.
    function connectedChainCount() external view returns (uint256) {
        return connectedChains.length;
    }

    // -------------------------------------------------------------------------
    // Rebalance execution — low-level cross-chain requests
    // -------------------------------------------------------------------------

    /**
     * @notice Execute a single rebalance from an overweight chain to an underweight one.
     *         Updates packed reserves and fires a low-level call to `bridgeRouter`.
     */
    function executeRebalance(
        uint256 fromChain,
        uint256 toChain,
        uint128 amount
    ) external returns (bool success) {
        if (amount == 0) revert ZeroAmount();
        if (!isImbalanced(fromChain) && !isImbalanced(toChain)) {
            revert NotImbalanced(fromChain);
        }

        _moveLiquidity(fromChain, toChain, amount);
        success = _dispatchRebalanceRequest(fromChain, toChain, amount);
        emit RebalanceRequested(fromChain, toChain, amount, success);
    }

    /**
     * @notice Batch rebalance requests. Each step updates packed storage and issues
     *         one low-level bridge call — keeping per-step overhead minimal.
     */
    function executeRebalanceBatch(
        uint256[] calldata fromChains,
        uint256[] calldata toChains,
        uint128[] calldata amounts
    ) external returns (bool[] memory results) {
        uint256 len = fromChains.length;
        if (len != toChains.length || len != amounts.length) revert LengthMismatch();

        results = new bool[](len);
        for (uint256 i = 0; i < len; ) {
            uint256 fromChain = fromChains[i];
            uint256 toChain = toChains[i];
            uint128 amount = amounts[i];

            if (amount == 0) revert ZeroAmount();
            if (!isImbalanced(fromChain) && !isImbalanced(toChain)) {
                revert NotImbalanced(fromChain);
            }

            _moveLiquidity(fromChain, toChain, amount);
            bool ok = _dispatchRebalanceRequest(fromChain, toChain, amount);
            results[i] = ok;
            emit RebalanceRequested(fromChain, toChain, amount, ok);

            unchecked {
                ++i;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _isActive(uint256 chainId) internal view returns (bool active) {
        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            active := and(shr(192, sload(keccak256(0x00, 0x40))), 0x1)
        }
    }

    /// @dev Debit `fromChain` and credit `toChain` in packed storage via Yul.
    function _moveLiquidity(uint256 fromChain, uint256 toChain, uint128 amount) internal {
        if (!_isActive(fromChain)) revert ChainNotActive(fromChain);
        if (!_isActive(toChain)) revert ChainNotActive(toChain);

        uint128 fromOld;
        uint128 fromNew;
        uint128 toOld;
        uint128 toNew;

        assembly {
            // --- source chain ---
            mstore(0x00, fromChain)
            mstore(0x20, chainData.slot)
            let fromSlot := keccak256(0x00, 0x40)
            let fromData := sload(fromSlot)

            fromOld := and(fromData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let fromTarget := and(shr(128, fromData), 0xFFFFFFFF)
            let fromBound := and(shr(160, fromData), 0xFFFFFFFF)

            if gt(amount, fromOld) {
                // signal insufficient via max sentinel; Solidity checks below
                fromNew := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
            }
            if iszero(eq(fromNew, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)) {
                fromNew := sub(fromOld, amount)
                let fromPacked := or(
                    fromNew,
                    or(shl(128, fromTarget), or(shl(160, fromBound), shl(192, 1)))
                )
                sstore(fromSlot, fromPacked)

                // --- destination chain ---
                mstore(0x00, toChain)
                mstore(0x20, chainData.slot)
                let toSlot := keccak256(0x00, 0x40)
                let toData := sload(toSlot)

                toOld := and(toData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                let toTarget := and(shr(128, toData), 0xFFFFFFFF)
                let toBound := and(shr(160, toData), 0xFFFFFFFF)

                toNew := add(toOld, amount)
                // uint128 overflow guard
                if gt(toNew, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) {
                    toNew := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
                    fromNew := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE
                }
                if iszero(eq(toNew, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)) {
                    let toPacked := or(
                        toNew,
                        or(shl(128, toTarget), or(shl(160, toBound), shl(192, 1)))
                    )
                    sstore(toSlot, toPacked)
                }
            }
        }

        if (fromNew == type(uint128).max) revert InsufficientReserve(fromChain);
        // overflow sentinel pair
        if (toNew == type(uint128).max && fromNew == type(uint128).max - 1) {
            revert InsufficientReserve(toChain);
        }

        // totalReserves unchanged (internal transfer across chains)
        emit ReserveUpdated(fromChain, fromOld, fromNew);
        emit ReserveUpdated(toChain, toOld, toNew);
    }

    /// @dev Low-level call into bridgeRouter with ABI-encoded rebalance calldata.
    function _dispatchRebalanceRequest(
        uint256 fromChain,
        uint256 toChain,
        uint128 amount
    ) internal returns (bool success) {
        address router = bridgeRouter;
        bytes4 selector = bytes4(keccak256("requestRebalance(uint256,uint256,uint128)"));

        assembly {
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x04), fromChain)
            mstore(add(ptr, 0x24), toChain)
            mstore(add(ptr, 0x44), amount)
            success := call(gas(), router, 0, ptr, 0x64, 0, 0)
            mstore(0x40, add(ptr, 0x80))
        }
    }
}

/**
 * @title MockBridgeRouter
 * @notice Test helper that records low-level rebalance requests.
 */
contract MockBridgeRouter {
    event RebalanceCall(uint256 fromChain, uint256 toChain, uint128 amount);

    uint256 public callCount;
    bool public shouldFail;

    function setShouldFail(bool fail) external {
        shouldFail = fail;
    }

    function requestRebalance(uint256 fromChain, uint256 toChain, uint128 amount) external {
        if (shouldFail) revert("MockBridgeRouter: forced failure");
        unchecked {
            ++callCount;
        }
        emit RebalanceCall(fromChain, toChain, amount);
    }
}
