// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Fixtures for static rule B002 — "unchecked validator address assignment".
//
// `B002Vulnerable` holds routines that MUST be flagged.
// `B002Safe`       holds routines that MUST NOT be flagged.

contract B002Vulnerable {
    mapping(address => bool) public isValidator;
    address[] public validators;
    uint256 public threshold;

    /// BAD: `validator` is registered without any address(0) assertion.
    function addValidator(address validator) external {
        isValidator[validator] = true;
        validators.push(validator);
    }

    /// BAD: batch update — elements are never checked element-wise.
    function setValidators(address[] calldata newValidators) external {
        for (uint256 i = 0; i < newValidators.length; i++) {
            isValidator[newValidators[i]] = true;
        }
    }

    /// BAD: multi-sig signer rotation, neither argument is checked.
    function rotateSigner(address oldSigner, address newSigner) external {
        isValidator[oldSigner] = false;
        isValidator[newSigner] = true;
    }

    /// BAD: an assertion exists, but it guards the wrong argument.
    function addValidatorWithWeight(address validator, uint256 weight) external {
        require(weight > 0, "B002: zero weight");
        isValidator[validator] = true;
        threshold += weight;
    }

    /// BAD: the comment claims a check that the code never performs.
    function _setValidator(address validator, bool active) internal {
        // validator must not be address(0)
        // require(validator != address(0), "zero validator");
        isValidator[validator] = active;
    }
}

contract B002Safe {
    mapping(address => bool) public isValidator;
    address[] public signers;
    address public feeRecipient;

    error ZeroValidator();

    modifier nonZeroAddress(address account) {
        require(account != address(0), "B002: zero address");
        _;
    }

    /// OK: explicit require on the validator input.
    function addValidatorGuarded(address validator) external {
        require(validator != address(0), "B002: zero validator");
        isValidator[validator] = true;
    }

    /// OK: custom-error guards on both inputs.
    function replaceSignerGuarded(address oldSigner, address newSigner) external {
        if (oldSigner == address(0)) revert ZeroValidator();
        if (newSigner == address(0)) revert ZeroValidator();
        isValidator[oldSigner] = false;
        isValidator[newSigner] = true;
    }

    /// OK: per-element assertion inside the update loop.
    function setValidatorsGuarded(address[] calldata newValidators) external {
        for (uint256 i = 0; i < newValidators.length; i++) {
            require(newValidators[i] != address(0), "B002: zero validator");
            isValidator[newValidators[i]] = true;
        }
    }

    /// OK: the check lives in a guarding modifier.
    function registerGuardian(address guardian) external nonZeroAddress(guardian) {
        isValidator[guardian] = true;
    }

    /// OK: element is aliased into a local, then asserted.
    function addSignerBatch(address[] memory candidates) public {
        for (uint256 i = 0; i < candidates.length; i++) {
            address candidate = candidates[i];
            require(candidate != address(0), "B002: zero signer");
            signers.push(candidate);
        }
    }

    /// OK: not a validator-set routine at all — out of scope for B002.
    function setFeeRecipient(address recipient) external {
        feeRecipient = recipient;
    }
}
