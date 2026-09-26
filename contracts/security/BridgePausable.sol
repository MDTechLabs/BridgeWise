// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract BridgePausable {
    error BridgePaused();
    error BridgeNotPaused();

    event Paused(address account);
    event Unpaused(address account);

    bool private _paused;

    modifier whenNotPaused() {
        if (_paused) revert BridgePaused();
        _;
    }

    modifier whenPaused() {
        if (!_paused) revert BridgeNotPaused();
        _;
    }

    function paused() external view returns (bool) {
        return _paused;
    }

    function _pause() internal {
        _paused = true;
        emit Paused(msg.sender);
    }

    function _unpause() internal {
        _paused = false;
        emit Unpaused(msg.sender);
    }
}
