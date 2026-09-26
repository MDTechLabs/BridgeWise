// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LiquidityRebalancer
 * @notice Dynamic multi-chain liquidity rebalancing engine with freshness checks.
 */
contract LiquidityRebalancer {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_DATA_AGE = 1 hours;

    mapping(uint256 => uint256) public chainData;
    mapping(uint256 => uint256) public lastUpdateTimestamp;
    uint256[] public connectedChains;
    uint256 public totalReserves;
    address public bridgeRouter;
    address public owner;

    event ChainConfigured(uint256 indexed chainId, uint32 targetRatioBps, uint32 imbalanceBoundBps);
    event ReserveUpdated(uint256 indexed chainId, uint128 oldReserve, uint128 newReserve);
    event ImbalanceDetected(uint256 indexed chainId, uint256 currentRatioBps, uint32 targetRatioBps, uint256 skewBps);
    event RebalanceRequested(uint256 indexed fromChain, uint256 indexed toChain, uint128 amount, bool success);
    event StaleDataRejected(uint256 indexed chainId, uint256 age);

    error Unauthorized();
    error InvalidTargetRatio();
    error InvalidBound();
    error ChainNotActive(uint256 chainId);
    error InvalidRouter();
    error InsufficientReserve(uint256 chainId);
    error NotImbalanced(uint256 chainId);
    error LengthMismatch();
    error ZeroAmount();
    error StaleData(uint256 chainId, uint256 age);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address router_) {
        if (router_ == address(0)) revert InvalidRouter();
        owner = msg.sender;
        bridgeRouter = router_;
    }

    function configureChain(uint256 chainId, uint32 targetRatioBps, uint32 imbalanceBoundBps) external onlyOwner {
        if (targetRatioBps == 0 || targetRatioBps > BPS) revert InvalidTargetRatio();
        if (imbalanceBoundBps == 0 || imbalanceBoundBps > BPS) revert InvalidBound();

        bool wasActive = _isActive(chainId);

        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            let slot := keccak256(0x00, 0x40)
            let existing := sload(slot)
            let reserve := and(existing, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
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

    function setBridgeRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert InvalidRouter();
        bridgeRouter = router_;
    }

    function updateReserve(uint256 chainId, uint128 newReserve) external onlyOwner {
        if (!_isActive(chainId)) revert ChainNotActive(chainId);

        if (block.timestamp > lastUpdateTimestamp[chainId] + MAX_DATA_AGE && lastUpdateTimestamp[chainId] != 0) {
            revert StaleData(chainId, block.timestamp - lastUpdateTimestamp[chainId]);
        }

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

        lastUpdateTimestamp[chainId] = block.timestamp;
        totalReserves = totalReserves - uint256(oldReserve) + uint256(newReserve);
        emit ReserveUpdated(chainId, oldReserve, newReserve);

        uint256 skew = skewBps(chainId);
        if (skew > imbalanceBoundBps) {
            emit ImbalanceDetected(chainId, currentRatioBps(chainId), targetRatioBps, skew);
        }
    }

    function getChainState(uint256 chainId)
        external
        view
        returns (uint128 reserve, uint32 targetRatioBps, uint32 imbalanceBoundBps, bool active, uint256 lastUpdate)
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
        lastUpdate = lastUpdateTimestamp[chainId];
    }

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

    function isStale(uint256 chainId) public view returns (bool) {
        if (lastUpdateTimestamp[chainId] == 0) return true;
        return block.timestamp > lastUpdateTimestamp[chainId] + MAX_DATA_AGE;
    }

    function connectedChainCount() external view returns (uint256) {
        return connectedChains.length;
    }

    function executeRebalance(uint256 fromChain, uint256 toChain, uint128 amount) external returns (bool success) {
        if (amount == 0) revert ZeroAmount();
        if (!isImbalanced(fromChain) && !isImbalanced(toChain)) {
            revert NotImbalanced(fromChain);
        }
        if (isStale(fromChain) || isStale(toChain)) {
            revert StaleData(fromChain, block.timestamp - lastUpdateTimestamp[fromChain]);
        }

        _moveLiquidity(fromChain, toChain, amount);
        success = _dispatchRebalanceRequest(fromChain, toChain, amount);
        emit RebalanceRequested(fromChain, toChain, amount, success);
    }

    function executeRebalanceBatch(uint256[] calldata fromChains, uint256[] calldata toChains, uint128[] calldata amounts) external returns (bool[] memory results) {
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
            if (isStale(fromChain) || isStale(toChain)) {
                revert StaleData(fromChain, block.timestamp - lastUpdateTimestamp[fromChain]);
            }

            _moveLiquidity(fromChain, toChain, amount);
            bool ok = _dispatchRebalanceRequest(fromChain, toChain, amount);
            results[i] = ok;
            emit RebalanceRequested(fromChain, toChain, amount, ok);

            unchecked { ++i; }
        }
    }

    function _isActive(uint256 chainId) internal view returns (bool active) {
        assembly {
            mstore(0x00, chainId)
            mstore(0x20, chainData.slot)
            active := and(shr(192, sload(keccak256(0x00, 0x40))), 0x1)
        }
    }

    function _moveLiquidity(uint256 fromChain, uint256 toChain, uint128 amount) internal {
        if (!_isActive(fromChain)) revert ChainNotActive(fromChain);
        if (!_isActive(toChain)) revert ChainNotActive(toChain);

        uint128 fromOld;
        uint128 fromNew;
        uint128 toOld;
        uint128 toNew;

        assembly {
            mstore(0x00, fromChain)
            mstore(0x20, chainData.slot)
            let fromSlot := keccak256(0x00, 0x40)
            let fromData := sload(fromSlot)

            fromOld := and(fromData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let fromTarget := and(shr(128, fromData), 0xFFFFFFFF)
            let fromBound := and(shr(160, fromData), 0xFFFFFFFF)

            if gt(amount, fromOld) {
                fromNew := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
            }
            if iszero(eq(fromNew, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)) {
                fromNew := sub(fromOld, amount)
                let fromPacked := or(
                    fromNew,
                    or(shl(128, fromTarget), or(shl(160, fromBound), shl(192, 1)))
                )
                sstore(fromSlot, fromPacked)

                mstore(0x00, toChain)
                mstore(0x20, chainData.slot)
                let toSlot := keccak256(0x00, 0x40)
                let toData := sload(toSlot)

                toOld := and(toData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                let toTarget := and(shr(128, toData), 0xFFFFFFFF)
                let toBound := and(shr(160, toData), 0xFFFFFFFF)

                toNew := add(toOld, amount)
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
        if (toNew == type(uint128).max && fromNew == type(uint128).max - 1) {
            revert InsufficientReserve(toChain);
        }

        emit ReserveUpdated(fromChain, fromOld, fromNew);
        emit ReserveUpdated(toChain, toOld, toNew);
    }

    function _dispatchRebalanceRequest(uint256 fromChain, uint256 toChain, uint128 amount) internal returns (bool success) {
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
