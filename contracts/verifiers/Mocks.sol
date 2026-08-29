// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSHA512 {
    bytes public returnHash;

    function setReturnHash(bytes memory _hash) external {
        returnHash = _hash;
    }

    fallback() external {
        bytes memory ret = returnHash;
        assembly {
            return(add(ret, 0x20), 64)
        }
    }
}

contract MockCurveHelper {
    bool public isValid;

    function setIsValid(bool _isValid) external {
        isValid = _isValid;
    }

    fallback() external {
        bool res = isValid;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, res)
            return(ptr, 0x20)
        }
    }
}
