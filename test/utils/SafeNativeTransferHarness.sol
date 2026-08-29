// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeNativeTransfer} from "../../contracts/utils/SafeNativeTransfer.sol";

/// @notice Test harness exposing {SafeNativeTransfer} next to the naked baselines it replaces.
contract SafeNativeTransferHarness {
    /// @dev Mirrored from {SafeNativeTransfer} so the selector is present in this ABI and
    ///      `revertedWithCustomError` can resolve it. Identical signature, identical selector.
    error NativeTransferFailed();

    event GasMeasured(uint8 indexed variant, uint256 gasUsed);

    receive() external payable {}

    /// @notice The utility under test.
    function releaseSafe(address to, uint256 amount) external {
        SafeNativeTransfer.safeTransferNative(to, amount);
    }

    /// @notice Baseline A — the naked pattern, discarding return data.
    function releaseNaked(address to, uint256 amount) external {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Native transfer failed");
    }

    /// @notice Baseline B — the naked pattern that copies the full revert reason to memory.
    function releaseNakedBubble(address to, uint256 amount) external {
        (bool ok, bytes memory reason) = to.call{value: amount}("");
        if (!ok) {
            if (reason.length == 0) revert("Native transfer failed");
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    /// @notice Measures the failure path of a variant and reports it via {GasMeasured}.
    /// @param variant 0 = safeTransferNative, 1 = releaseNakedBubble.
    function measureFailure(uint8 variant, address to, uint256 amount) external {
        uint256 start = gasleft();
        if (variant == 0) {
            try this.releaseSafe(to, amount) {} catch {}
        } else {
            try this.releaseNakedBubble(to, amount) {} catch {}
        }
        emit GasMeasured(variant, start - gasleft());
    }
}

/// @notice Accepts native transfers.
contract PayableReceiver {
    uint256 public received;

    receive() external payable {
        received += msg.value;
    }
}

/// @notice Rejects native transfers with empty revert data.
contract RejectingReceiver {
    receive() external payable {
        revert();
    }
}

/// @notice Rejects native transfers with a 4 KiB revert payload.
contract RevertBombReceiver {
    receive() external payable {
        assembly {
            let size := 4096
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, size))
            revert(ptr, size)
        }
    }
}
