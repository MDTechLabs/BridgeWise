// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FlashLoanGuardVault
/// @notice Single-asset liquidity vault that issues LP shares and blocks
///         single-block deposit-and-withdraw cycles so a flash-loan-funded
///         actor cannot temporarily skew the share price (or the bridge yield
///         accrued to LPs) and unwind the position before the borrowed funds
///         are repaid in the same transaction.
/// @dev Every account has one `lastActionBlock` entry that is updated on both
///      `deposit` and `withdraw`. Any deposit or withdrawal attempted in the
///      same block as that account's previous deposit or withdrawal reverts,
///      which in particular rules out the classic
///      borrow -> deposit -> (manipulate) -> withdraw -> repay
///      flash-loan cycle, since the withdraw leg always lands in the same
///      block as the deposit leg. Legitimate LPs are unaffected because they
///      never need to deposit and withdraw within the same block.
contract FlashLoanGuardVault is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Underlying ERC-20 asset held by the vault.
    IERC20 public immutable asset;

    /// @notice Last block number in which `account` deposited or withdrew.
    mapping(address => uint256) public lastActionBlock;

    /// @notice Thrown when a deposit or withdrawal is attempted in the same
    ///         block as the caller's previous deposit or withdrawal.
    error SameBlockFlashLoanCycle(address account, uint256 blockNumber);

    /// @notice Thrown when a zero-amount deposit or withdrawal is attempted,
    ///         or when the computed share/asset amount rounds down to zero.
    error ZeroAmount();

    /// @notice Thrown when a withdrawal requests more shares than the caller holds.
    error InsufficientShares();

    /// @notice Emitted when `account` deposits `assets` and receives `shares`.
    event Deposited(address indexed account, uint256 assets, uint256 shares);

    /// @notice Emitted when `account` redeems `shares` for `assets`.
    event Withdrawn(address indexed account, uint256 shares, uint256 assets);

    /// @param _asset  Underlying ERC-20 token accepted by the vault.
    /// @param name_   LP share token name.
    /// @param symbol_ LP share token symbol.
    /// @param admin   Initial owner, authorized to pause/unpause the vault.
    constructor(
        IERC20 _asset,
        string memory name_,
        string memory symbol_,
        address admin
    ) ERC20(name_, symbol_) Ownable(admin) {
        asset = _asset;
    }

    /// @notice Reverts if `msg.sender` already deposited or withdrew in the
    ///         current block; otherwise records this action's block after
    ///         the wrapped function body completes.
    modifier flashLoanGuard() {
        uint256 last = lastActionBlock[msg.sender];
        if (last == block.number) {
            revert SameBlockFlashLoanCycle(msg.sender, block.number);
        }
        _;
        lastActionBlock[msg.sender] = block.number;
    }

    /// @notice Total underlying assets currently held by the vault.
    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Deposit `assets` of the underlying token and receive LP shares
    ///         proportional to the current share price.
    /// @param assets Amount of underlying token to deposit.
    /// @return shares Amount of LP shares minted to the caller.
    function deposit(
        uint256 assets
    ) external nonReentrant whenNotPaused flashLoanGuard returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        uint256 assetsBefore = totalAssets();

        shares = supply == 0 ? assets : (assets * supply) / assetsBefore;
        if (shares == 0) revert ZeroAmount();

        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, assets, shares);
    }

    /// @notice Burn `shares` of LP tokens and withdraw the proportional amount
    ///         of underlying assets.
    /// @param shares Amount of LP shares to redeem.
    /// @return assets Amount of underlying token returned to the caller.
    function withdraw(
        uint256 shares
    ) external nonReentrant whenNotPaused flashLoanGuard returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < shares) revert InsufficientShares();

        uint256 supply = totalSupply();
        assets = (shares * totalAssets()) / supply;
        if (assets == 0) revert ZeroAmount();

        _burn(msg.sender, shares);
        asset.safeTransfer(msg.sender, assets);

        emit Withdrawn(msg.sender, shares, assets);
    }

    /// @notice Pause deposits and withdrawals in an emergency.
    /// @dev Only callable by the owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume deposits and withdrawals.
    /// @dev Only callable by the owner.
    function unpause() external onlyOwner {
        _unpause();
    }
}
