// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title B004Vulnerable
 * @notice Demonstrates unsafe usage of native ecrecover without zero-address checks (Rule B004).
 */
contract B004Vulnerable {
    address public admin;
    mapping(address => bool) public isValidator;

    error Unauthorized();

    // 1. BAD: Variable assigned from ecrecover and directly compared without zero check
    function verifySignatureUnchecked(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = ecrecover(hash, v, r, s);
        require(signer == expectedSigner, "Invalid signature");
        return true;
    }

    // 2. BAD: Inline ecrecover directly compared to admin in require
    function executeAsAdmin(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(ecrecover(hash, v, r, s) == admin, "Unauthorized admin");
    }

    // 3. BAD: Direct return of ecrecover result without zero assertion
    function recoverSigner(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external pure returns (address) {
        return ecrecover(hash, v, r, s);
    }

    // 4. BAD: If branch check comparing recovered signer to expected address without zero validation
    function executeIfValidator(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedValidator
    ) external view returns (bool) {
        address recovered = ecrecover(hash, v, r, s);
        if (recovered == expectedValidator && isValidator[recovered]) {
            return true;
        }
        revert Unauthorized();
    }

    // 5. BAD: Assembly ecrecover without zero address check
    function recoverAssembly(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (address recovered) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, hash)
            mstore(add(ptr, 0x20), v)
            mstore(add(ptr, 0x40), r)
            mstore(add(ptr, 0x60), s)
            pop(staticcall(gas(), 1, ptr, 0x80, ptr, 0x20))
            recovered := mload(ptr)
        }
    }
}

/**
 * @title B004Safe
 * @notice Demonstrates safe usage of ecrecover with explicit zero checks or OpenZeppelin ECDSA.
 */
contract B004Safe {
    address public admin;

    error ZeroSigner();
    error InvalidSigner();

    // 1. OK: Explicit require checking signer != address(0)
    function verifyGuardedRequire(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "Zero address signature");
        require(signer == expectedSigner, "Invalid signer");
        return true;
    }

    // 2. OK: Combined require condition checking != address(0)
    function verifyCombinedRequire(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0) && signer == expectedSigner, "Invalid signature");
        return true;
    }

    // 3. OK: Revert guard on zero address using custom error
    function verifyGuardedRevert(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) revert ZeroSigner();
        if (signer != expectedSigner) revert InvalidSigner();
        return true;
    }

    // 4. OK: Inline ecrecover with explicit zero address check
    function verifyInlineGuarded(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        require(
            ecrecover(hash, v, r, s) != address(0) && ecrecover(hash, v, r, s) == expectedSigner,
            "Invalid signature"
        );
        return true;
    }

    // 5. OK: OpenZeppelin ECDSA library call (wrapper handles zero check)
    function verifyECDSA(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = ECDSA.recover(hash, v, r, s);
        return signer == expectedSigner;
    }

    // 6. OK: OpenZeppelin hash.recover(...) syntax
    function verifyECDSAMember(
        bytes32 hash,
        bytes memory signature,
        address expectedSigner
    ) external pure returns (bool) {
        address signer = hash.recover(signature);
        return signer == expectedSigner;
    }

    // 7. OK: Function with no cryptographic signature logic
    function setAdmin(address newAdmin) external {
        require(newAdmin != address(0), "Zero address");
        admin = newAdmin;
    }
}

library ECDSA {
    function recover(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal pure returns (address) {
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "ECDSA: invalid signature");
        return signer;
    }

    function recover(
        bytes32 hash,
        bytes memory signature
    ) internal pure returns (address) {
        // dummy stub for fixture
        return address(1);
    }
}
