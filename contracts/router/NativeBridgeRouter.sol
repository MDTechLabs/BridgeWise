// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IWETH Minimal interface for wrapped native token.
interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title IBridgeVault Minimal interface for the core bridge vault.
interface IBridgeVault {
    function lock(
        uint32 destinationChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external;
}

/// @title NativeBridgeRouter
/// @notice Accepts native gas tokens ($ETH, $XLM), auto-wraps them to
///         ERC-20/WETH, and dispatches cross-chain lock events in a single
///         transaction — removing the need for users to manually deposit
///         into wrapped token contracts before bridging.
contract NativeBridgeRouter {
    event NativeBridged(
        uint32 indexed destinationChainId,
        address indexed sender,
        uint256 amount,
        bytes32 recipient
    );

    IWETH public immutable weth;
    IBridgeVault public immutable vault;

    error InsufficientBalance();
    error RefundFailed();

    constructor(address _weth, address _vault) {
        weth = IWETH(_weth);
        vault = IBridgeVault(_vault);
    }

    /// @notice Receive native ETH (e.g. from a plain transfer).
    receive() external payable {}

    /// @notice Wrap native ETH and bridge it in a single call.
    /// @param destinationChainId Target chain for the cross-chain transfer.
    /// @param recipient          32-byte normalized recipient on destination.
    function depositNative(
        uint32 destinationChainId,
        bytes32 recipient
    ) external payable {
        uint256 value = msg.value;
        require(value > 0, "NativeBridgeRouter: zero value");

        // Wrap native → WETH
        weth.deposit{value: value}();

        // Approve the vault to pull WETH
        weth.approve(address(vault), value);

        // Lock in the bridge vault
        vault.lock(destinationChainId, address(weth), value, recipient);

        emit NativeBridged(destinationChainId, msg.sender, value, recipient);
    }
}
