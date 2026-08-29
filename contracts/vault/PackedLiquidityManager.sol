// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PackedLiquidityManager
 * @dev Manages liquidity across bridge pools using bit-packed 256-bit words to minimize SLOAD/SSTORE operations.
 */
contract PackedLiquidityManager {
    // Slot layout for Pool (256 bits):
    // [0-111]   : reserve0 (112 bits)
    // [112-223] : reserve1 (112 bits)
    // [224-255] : feeRate (32 bits) (10000 = 100%)
    mapping(uint256 => uint256) public poolData;

    // Slot layout for User Position (256 bits):
    // [0-127]   : liquidityShares (128 bits)
    // [128-255] : feeAccrued (128 bits)
    mapping(uint256 => mapping(address => uint256)) public userPositions;

    event LiquidityAdded(uint256 indexed poolId, address indexed user, uint112 amount0, uint112 amount1, uint128 shares);
    event LiquidityRemoved(uint256 indexed poolId, address indexed user, uint112 amount0, uint112 amount1, uint128 shares);
    event Swap(uint256 indexed poolId, address indexed user, bool zeroForOne, uint112 amountIn, uint112 amountOut);

    error InsufficientLiquidity();
    error ReserveOverflow();
    error ShareOverflow();

    function initializePool(uint256 poolId, uint32 feeRate) external {
        assembly {
            mstore(0, poolId)
            mstore(32, poolData.slot)
            let slot := keccak256(0, 64)
            let data := shl(224, feeRate)
            sstore(slot, data)
        }
    }

    function addLiquidity(
        uint256 poolId,
        uint112 amount0,
        uint112 amount1
    ) external returns (uint128 shares) {
        address user = msg.sender;
        assembly {
            mstore(0, poolId)
            mstore(32, poolData.slot)
            let poolSlot := keccak256(0, 64)
            let pData := sload(poolSlot)

            let reserve0 := and(pData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let reserve1 := and(shr(112, pData), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let feeRate := shr(224, pData)

            let newReserve0 := add(reserve0, amount0)
            let newReserve1 := add(reserve1, amount1)

            if or(
                gt(newReserve0, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF),
                gt(newReserve1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            ) {
                mstore(0, 0x16b04294) // ReserveOverflow()
                revert(0x1c, 0x04)
            }

            shares := add(amount0, amount1)
            
            let newPData := or(
                newReserve0,
                or(
                    shl(112, newReserve1),
                    shl(224, feeRate)
                )
            )
            sstore(poolSlot, newPData)

            mstore(0, poolId)
            mstore(32, userPositions.slot)
            let innerHash := keccak256(0, 64)
            mstore(0, user)
            mstore(32, innerHash)
            let userSlot := keccak256(0, 64)

            let uData := sload(userSlot)
            
            let userShares := and(uData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let userFees := shr(128, uData)

            let newUserShares := add(userShares, shares)
            if gt(newUserShares, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) {
                mstore(0, 0x2287b3fa) // ShareOverflow()
                revert(0x1c, 0x04)
            }

            let newUData := or(
                newUserShares,
                shl(128, userFees)
            )
            sstore(userSlot, newUData)
        }
        emit LiquidityAdded(poolId, user, amount0, amount1, shares);
    }

    function removeLiquidity(
        uint256 poolId,
        uint128 shares
    ) external returns (uint112 amount0, uint112 amount1) {
        address user = msg.sender;
        assembly {
            mstore(0, poolId)
            mstore(32, poolData.slot)
            let poolSlot := keccak256(0, 64)
            let pData := sload(poolSlot)

            let reserve0 := and(pData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let reserve1 := and(shr(112, pData), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let feeRate := shr(224, pData)

            mstore(0, poolId)
            mstore(32, userPositions.slot)
            let innerHash := keccak256(0, 64)
            mstore(0, user)
            mstore(32, innerHash)
            let userSlot := keccak256(0, 64)
            let uData := sload(userSlot)

            let userShares := and(uData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let userFees := shr(128, uData)

            if gt(shares, userShares) {
                mstore(0, 0xbb55fd27) // InsufficientLiquidity()
                revert(0x1c, 0x04)
            }

            amount0 := div(shares, 2)
            amount1 := div(shares, 2)

            if or(gt(amount0, reserve0), gt(amount1, reserve1)) {
                mstore(0, 0xbb55fd27)
                revert(0x1c, 0x04)
            }

            let newReserve0 := sub(reserve0, amount0)
            let newReserve1 := sub(reserve1, amount1)
            let newUserShares := sub(userShares, shares)

            let newPData := or(
                newReserve0,
                or(
                    shl(112, newReserve1),
                    shl(224, feeRate)
                )
            )
            sstore(poolSlot, newPData)

            let newUData := or(
                newUserShares,
                shl(128, userFees)
            )
            sstore(userSlot, newUData)
        }
        emit LiquidityRemoved(poolId, user, amount0, amount1, shares);
    }

    function bridgeSwap(
        uint256 poolId,
        bool zeroForOne,
        uint112 amountIn
    ) external returns (uint112 amountOut) {
        address user = msg.sender;
        assembly {
            mstore(0, poolId)
            mstore(32, poolData.slot)
            let poolSlot := keccak256(0, 64)
            let pData := sload(poolSlot)

            let reserve0 := and(pData, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let reserve1 := and(shr(112, pData), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            let feeRate := shr(224, pData)

            let fee := div(mul(amountIn, feeRate), 10000)
            let amountInAfterFee := sub(amountIn, fee)

            amountOut := amountInAfterFee

            let newReserve0 := reserve0
            let newReserve1 := reserve1

            if iszero(zeroForOne) {
                if gt(amountOut, reserve0) {
                    mstore(0, 0xbb55fd27) // InsufficientLiquidity()
                    revert(0x1c, 0x04)
                }
                newReserve1 := add(reserve1, amountIn)
                newReserve0 := sub(reserve0, amountOut)
            }
            if zeroForOne {
                if gt(amountOut, reserve1) {
                    mstore(0, 0xbb55fd27) // InsufficientLiquidity()
                    revert(0x1c, 0x04)
                }
                newReserve0 := add(reserve0, amountIn)
                newReserve1 := sub(reserve1, amountOut)
            }

            if or(
                gt(newReserve0, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF),
                gt(newReserve1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            ) {
                mstore(0, 0x16b04294) // ReserveOverflow()
                revert(0x1c, 0x04)
            }

            let newPData := or(
                newReserve0,
                or(
                    shl(112, newReserve1),
                    shl(224, feeRate)
                )
            )
            sstore(poolSlot, newPData)
        }
        emit Swap(poolId, user, zeroForOne, amountIn, amountOut);
    }
}
