// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IReentrantTarget {
    function reconcileInboundTransfer(
        IERC20 token,
        address from,
        uint256 nominalAmount,
        uint256 minExpectedDelta,
        bytes32 messageId
    ) external returns (uint256);
}

/// @notice Malicious callback token attempting reentrancy attacks
contract MaliciousCallbackToken is ERC20 {
    address public target;
    bool public attackOnTransfer;
    bool public attackTriggered;

    constructor() ERC20("Malicious Callback Token", "MAL") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function setTarget(address _target, bool _attack) external {
        target = _target;
        attackOnTransfer = _attack;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackOnTransfer && target != address(0)) {
            attackTriggered = true;
            attackOnTransfer = false; // prevent infinite recursion in token itself
            // Reentrancy attack attempt
            IReentrantTarget(target).reconcileInboundTransfer(
                IERC20(address(this)),
                from,
                amount,
                amount,
                keccak256("reentrant-attack")
            );
        }
        return super.transferFrom(from, to, amount);
    }
}

/// @notice Token with fee-on-transfer deduction
contract FeeOnTransferToken is ERC20 {
    uint256 public feeBps; // 100 = 1%

    constructor(uint256 _feeBps) ERC20("Fee On Transfer Token", "FOT") {
        feeBps = _feeBps;
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function setFeeBps(uint256 _feeBps) external {
        feeBps = _feeBps;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;

        _spendAllowance(from, _msgSender(), amount);
        _burn(from, fee);
        _transfer(from, to, netAmount);
        return true;
    }
}

/// @notice Rebasing token with elastic supply
contract RebasingToken is ERC20 {
    mapping(address => uint256) private _rawBalances;
    uint256 public multiplier = 100;
    uint256 public divisor = 100;

    constructor() ERC20("Rebasing Token", "RBT") {
        _rawBalances[msg.sender] = 1_000_000 * 10 ** 18;
    }

    function rebase(uint256 newMultiplier, uint256 newDivisor) external {
        require(newDivisor > 0, "Zero divisor");
        multiplier = newMultiplier;
        divisor = newDivisor;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return (_rawBalances[account] * multiplier) / divisor;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, _msgSender(), amount);
        uint256 rawAmount = (amount * divisor) / multiplier;
        require(_rawBalances[from] >= rawAmount, "Insufficient balance");
        _rawBalances[from] -= rawAmount;
        _rawBalances[to] += rawAmount;
        emit Transfer(from, to, amount);
        return true;
    }
}
