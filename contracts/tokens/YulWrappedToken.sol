// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title YulWrappedToken
/// @notice Custom Yul execution handler for minting wrapped cross-chain tokens.
contract YulWrappedToken {
    address public immutable bridge;
    
    error Unauthorized();
    error MintFailed();

    constructor(address _bridge) {
        bridge = _bridge;
    }

    /// @notice Mints wrapped tokens by making a low-level call to the token contract.
    /// @dev Uses inline assembly to minimize gas overhead by formatting calldata in scratch memory.
    function mint(address token, address to, uint256 amount) external {
        if (msg.sender != bridge) {
            revert Unauthorized();
        }
        
        bool success;
        assembly {
            // Function selector for mint(address,uint256): 0x40c10f19
            mstore(0x00, 0x40c10f1900000000000000000000000000000000000000000000000000000000)
            mstore(0x04, and(to, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(0x24, amount)
            
            // Execute the low-level call to mint tokens
            // gas(), token, value, in_offset, in_size, out_offset, out_size
            success := call(gas(), token, 0, 0x00, 0x44, 0, 0)
        }
        
        if (!success) {
            revert MintFailed();
        }
    }
}
