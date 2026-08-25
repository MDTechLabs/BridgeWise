// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;




/// @title AddressUtils
/// @notice Utility library for converting between 20-byte EVM addresses and
///         32-byte normalized cross-chain recipient identifiers.
library AddressUtils {
    /// @notice Convert a 32-byte identifier to a 20-byte EVM address.
    /// @dev Reverts if the upper 12 bytes are non-zero (dirty high-order bits).
    /// @param input The 32-byte cross-chain recipient identifier.
    /// @return The corresponding 20-byte EVM address.
    function bytes32ToAddress(bytes32 input) internal pure returns (address) {
        // Check that upper 12 bytes are zeroed
        require(
            uint96(uint256(input)) == 0,
            "InvalidAddressMapping"
        );
        return address(uint160(uint256(input)));
    }

    /// @notice Convert a 20-byte EVM address to a 32-byte identifier by left-padding with zeroes.
    /// @param input The 20-byte EVM address.
    /// @return The corresponding 32-byte cross-chain identifier.
    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }
}
