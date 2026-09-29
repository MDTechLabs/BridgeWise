// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeNativeTransfer} from "../utils/SafeNativeTransfer.sol";
import {BitmaskVerifierYul} from "../crypto/BitmaskVerifierYul.sol";

contract GasEscrow {
    uint256 public immutable overhead;
    event GasRefunded(address indexed refundAddress, uint256 gasUsed, uint256 refundAmount);
    event EscrowDeposited(address indexed sender, uint256 amount);

    constructor(uint256 _overhead) {
        overhead = _overhead;
    }

    receive() external payable {
        emit EscrowDeposited(msg.sender, msg.value);
    }

    function executeWithGasEscrow(address target, bytes calldata data, address payable refundAddress) external payable returns (bool success, bytes memory returnData, uint256 gasUsed, uint256 refundAmount) {
        uint256 gasStart = gasleft();
        (success, returnData) = target.call(data);
        uint256 gasEnd = gasleft();
        uint256 gasConsumed = (gasStart > gasEnd) ? (gasStart - gasEnd) : 0;
        gasUsed = gasConsumed + overhead;
        uint256 executionCost = gasUsed * tx.gasprice;
        if (msg.value > executionCost) {
            refundAmount = msg.value - executionCost;
            if (refundAmount > 0 && refundAddress != address(0)) {
                SafeNativeTransfer.safeTransferNative(refundAddress, refundAmount);
            }
        } else {
            refundAmount = 0;
        }
        emit GasRefunded(refundAddress, gasUsed, refundAmount);
    }
}

contract BitmaskVerifierYulWrapper {
    function verifyThreshold(bytes calldata packedSignatures, uint256 validatorBitmask, address[] calldata validatorAddresses, uint256 threshold) external view returns (bool) {
        return BitmaskVerifierYul.verifyThreshold(packedSignatures, validatorBitmask, validatorAddresses, threshold);
    }

    function countSetBits(uint256 bitmask) external pure returns (uint256) {
        return BitmaskVerifierYul.countSetBits(bitmask);
    }
}
