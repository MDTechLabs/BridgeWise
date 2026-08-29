// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BridgePausable} from "../../contracts/security/BridgePausable.sol";

contract BridgePausableHarness is BridgePausable {
    event Ping();

    function pause() external {
        _pause();
    }

    function unpause() external {
        _unpause();
    }

    function ping() external whenNotPaused {
        emit Ping();
    }

    function pong() external whenPaused {
        emit Ping();
    }
}
