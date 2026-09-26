// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ChainBitmapRegistry
 * @notice Low-gas registry for tracking cross-chain execution path support using a single 256-bit storage slot.
 * @dev Packs supported chain identifiers (0-255) into a uint256 bitmap, replacing high-gas mapping SLOAD operations.
 */
contract ChainBitmapRegistry {
    /// @dev Packed bitmap representing chain support for IDs 0 to 255 (1 storage slot)
    uint256 private _chainBitmap;

    /// @dev Legacy mapping stored for gas benchmarking comparisons
    mapping(uint32 => bool) public supportedChainsMapping;

    /// @notice Emitted when the support status for a specific chain is updated
    event ChainSupportToggled(uint256 indexed chainId, bool indexed supported);

    /// @notice Emitted when the chain bitmap is replaced completely
    event ChainBitmapUpdated(uint256 newBitmap);

    /// @notice Reverted when a chain ID exceeds the supported 256-bit range (0 to 255)
    /// @param chainId The invalid chain ID provided
    error InvalidChainId(uint256 chainId);

    /**
     * @notice Checks if a target chain ID (0-255) is supported using a single storage slot read.
     * @param chainId The chain identifier to check.
     * @return supported True if the chain is supported, false otherwise.
     */
    function isChainSupported(uint256 chainId) public view returns (bool supported) {
        if (chainId > 255) revert InvalidChainId(chainId);
        assembly {
            let slot := _chainBitmap.slot
            let bitmap := sload(slot)
            supported := and(shr(chainId, bitmap), 1)
        }
    }

    /**
     * @notice Sets or clears support for a specific target chain ID (0-255).
     * @param chainId The chain identifier to set.
     * @param supported True to enable chain support, false to disable.
     */
    function setChainSupport(uint256 chainId, bool supported) public {
        if (chainId > 255) revert InvalidChainId(chainId);
        assembly {
            let slot := _chainBitmap.slot
            let bitmap := sload(slot)
            let mask := shl(chainId, 1)
            switch supported
            case 0 {
                bitmap := and(bitmap, not(mask))
            }
            default {
                bitmap := or(bitmap, mask)
            }
            sstore(slot, bitmap)
        }
        emit ChainSupportToggled(chainId, supported);
    }

    /**
     * @notice Toggles the current support status for a target chain ID (0-255).
     * @param chainId The chain identifier to toggle.
     * @return newStatus The updated support status for the chain.
     */
    function toggleChainSupport(uint256 chainId) public returns (bool newStatus) {
        if (chainId > 255) revert InvalidChainId(chainId);
        assembly {
            let slot := _chainBitmap.slot
            let bitmap := sload(slot)
            let mask := shl(chainId, 1)
            bitmap := xor(bitmap, mask)
            sstore(slot, bitmap)
            newStatus := and(shr(chainId, bitmap), 1)
        }
        emit ChainSupportToggled(chainId, newStatus);
    }

    /**
     * @notice Checks if all chains specified in a multi-hop execution route mask are supported.
     * @dev Performs route validation across multiple chain IDs in a single SLOAD operation.
     * @param routeMask Bitmask where bit position `i` is set if chain `i` is required in the route.
     * @return allSupported True if every chain in the route mask is active in the bitmap.
     */
    function areAllChainsSupported(uint256 routeMask) public view returns (bool allSupported) {
        assembly {
            let slot := _chainBitmap.slot
            let bitmap := sload(slot)
            allSupported := eq(and(bitmap, routeMask), routeMask)
        }
    }

    /**
     * @notice Updates support for multiple chain IDs in a single storage write.
     * @param chainIds Array of chain IDs (0-255).
     * @param supported True to enable support, false to disable.
     */
    function setBatchChainSupport(uint256[] calldata chainIds, bool supported) public {
        assembly {
            let slot := _chainBitmap.slot
            let bitmap := sload(slot)
            let len := chainIds.length
            let ptr := chainIds.offset
            for { let i := 0 } lt(i, len) { i := add(i, 1) } {
                let id := calldataload(add(ptr, mul(i, 0x20)))
                if gt(id, 255) {
                    mstore(0x00, 0x93309a06)
                    mstore(0x04, id)
                    revert(0x00, 0x24)
                }
                let mask := shl(id, 1)
                switch supported
                case 0 {
                    bitmap := and(bitmap, not(mask))
                }
                default {
                    bitmap := or(bitmap, mask)
                }
            }
            sstore(slot, bitmap)
        }
    }

    /**
     * @notice Returns the full 256-bit bitmap word.
     * @return bitmap Raw uint256 storage word representing supported chains.
     */
    function getChainBitmap() public view returns (uint256 bitmap) {
        assembly {
            let slot := _chainBitmap.slot
            bitmap := sload(slot)
        }
    }

    /**
     * @notice Replaces the entire chain bitmap word in a single transaction.
     * @param newBitmap Raw uint256 value to store.
     */
    function setChainBitmap(uint256 newBitmap) public {
        assembly {
            let slot := _chainBitmap.slot
            sstore(slot, newBitmap)
        }
        emit ChainBitmapUpdated(newBitmap);
    }

    /**
     * @notice Legacy mapping view function for gas benchmarking.
     * @param chainId Chain ID to query.
     */
    function isChainSupportedMapping(uint32 chainId) public view returns (bool) {
        return supportedChainsMapping[chainId];
    }

    /**
     * @notice Legacy mapping update function for gas benchmarking.
     * @param chainId Chain ID to update.
     * @param supported Target support status.
     */
    function setChainSupportMapping(uint32 chainId, bool supported) public {
        supportedChainsMapping[chainId] = supported;
    }
}
