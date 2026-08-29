import { parseSolidityFiles } from '../solidity-parser';
import { StateVerifier } from '../state_verifier';
import { ParsedContract } from '../types';

// ---------------------------------------------------------------------------
// Sample Solidity sources for testing
// ---------------------------------------------------------------------------

const BRIDGE_WRAPPED_TOKEN_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract BridgeWrappedToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public totalMinted;

    constructor(
        string memory name_,
        string memory symbol_,
        address bridgeVault,
        address admin
    ) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, bridgeVault);
        _grantRole(BURNER_ROLE, bridgeVault);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        totalMinted += amount;
    }

    function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
        super.burnFrom(account, amount);
        totalMinted -= amount;
    }
}
`;

const BAD_MINT_CONTRACT_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadBridgeToken {
    uint256 public totalMinted;

    // VULNERABILITY: public mint with no access control
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
        totalMinted += amount;
    }

    function _mint(address to, uint256 amount) internal {
        // simplified mint logic
    }
}
`;

const VAULT_HEALTH_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReserveVault {
    function lockedReserves(address token) external view returns (uint256);
}

contract VaultHealthEvaluator {
    uint256 public constant BPS = 10_000;
    uint256 public constant UNDERCOLLATERALIZED_THRESHOLD = 10_000;
    uint256 public constant CRITICAL_THRESHOLD = 8_000;

    uint256 public totalLockedReserves;
    uint256 public totalMintedSupply;

    function evaluate(
        address reserveVault,
        address wrappedToken
    ) external view returns (uint256 ratioBps, uint256 health) {
        uint256 totalLocked = IReserveVault(reserveVault).lockedReserves(wrappedToken);
        uint256 totalMinted = 1000;
        if (totalMinted == 0) {
            return (0, 0);
        }
        ratioBps = (totalLocked * BPS) / totalMinted;
        return (ratioBps, 0);
    }
}
`;

const MINT_BEFORE_LOCK_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MintBeforeLockBridge {
    uint256 public lockedReserves;
    uint256 public mintedSupply;

    // VULNERABILITY: mints before locking
    function bridgeIn(address token, uint256 amount, address to) external {
        // Mint happens first - re-entrancy risk
        mintedSupply += amount;
        // Lock reserves after mint
        lockedReserves += amount;
    }
}
`;

const CORRECT_BRIDGE_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CorrectBridge {
    uint256 public lockedReserves;
    uint256 public mintedSupply;

    // CORRECT: locks before minting
    function bridgeIn(address token, uint256 amount, address to) external {
        lockedReserves += amount;  // lock first
        mintedSupply += amount;     // mint after lock
    }
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StateVerifier', () => {
  let verifier: StateVerifier;

  beforeEach(() => {
    verifier = new StateVerifier();
  });

  describe('Solidity Parser', () => {
    it('should parse a contract with mint/burn functions', () => {
      const contracts = parseSolidityFiles([
        { path: 'BridgeWrappedToken.sol', content: BRIDGE_WRAPPED_TOKEN_SRC },
      ]);

      expect(contracts.length).toBe(1);
      const contract = contracts[0];
      expect(contract.name).toBe('BridgeWrappedToken');
      expect(contract.inherits).toContain('ERC20');
      expect(contract.inherits).toContain('AccessControl');

      const funcNames = contract.functions.map((f) => f.name);
      expect(funcNames).toContain('mint');
      expect(funcNames).toContain('burnFrom');

      const mintFunc = contract.functions.find((f) => f.name === 'mint');
      expect(mintFunc).toBeDefined();
      expect(mintFunc!.transitions.length).toBeGreaterThan(0);
      expect(mintFunc!.transitions.some((t) => t.operationName === '_mint')).toBe(true);

      const burnFunc = contract.functions.find((f) => f.name === 'burnFrom');
      expect(burnFunc).toBeDefined();
    });

    it('should detect state variables with balance semantics', () => {
      const contracts = parseSolidityFiles([
        { path: 'VaultHealthEvaluator.sol', content: VAULT_HEALTH_SRC },
      ]);

      expect(contracts.length).toBe(1);
      const lockedVars = contracts[0].stateVariables.filter((v) => v.category === 'locked');
      const mintedVars = contracts[0].stateVariables.filter((v) => v.category === 'minted');

      expect(lockedVars.length).toBeGreaterThan(0);
      const lockedNames = lockedVars.map((v) => v.name);
      expect(lockedNames.some((n) => /locked|reserve/i.test(n))).toBe(true);
    });

    it('should parse multiple contracts from multiple files', () => {
      const contracts = parseSolidityFiles([
        { path: 'BridgeWrappedToken.sol', content: BRIDGE_WRAPPED_TOKEN_SRC },
        { path: 'VaultHealthEvaluator.sol', content: VAULT_HEALTH_SRC },
      ]);

      expect(contracts.length).toBe(2);
      expect(contracts.map((c) => c.name)).toContain('BridgeWrappedToken');
      expect(contracts.map((c) => c.name)).toContain('VaultHealthEvaluator');
    });

    it('should detect state transitions from compound assignments', () => {
      const contracts = parseSolidityFiles([
        { path: 'CorrectBridge.sol', content: CORRECT_BRIDGE_SRC },
      ]);

      const bridgeFunc = contracts[0].functions.find((f) => f.name === 'bridgeIn');
      expect(bridgeFunc).toBeDefined();
      expect(
        bridgeFunc!.transitions.some(
          (t) => t.operation === 'add' && t.category === 'locked',
        ),
      ).toBe(true);
      expect(
        bridgeFunc!.transitions.some(
          (t) => t.operation === 'add' && t.category === 'minted',
        ),
      ).toBe(true);
    });
  });

  describe('Invariant Checking', () => {
    it('should detect missing access control on mint functions', () => {
      const contracts = parseSolidityFiles([
        { path: 'BadBridgeToken.sol', content: BAD_MINT_CONTRACT_SRC },
      ]);

      const result = verifier.verify(contracts);

      const criticalViolations = result.violations.filter(
        (v) => v.severity === 'critical',
      );
      expect(criticalViolations.length).toBeGreaterThan(0);
      expect(
        criticalViolations.some((v) => v.category === 'access-control'),
      ).toBe(true);
    });

    it('should not flag properly gated mint as access control violation', () => {
      const contracts = parseSolidityFiles([
        { path: 'BridgeWrappedToken.sol', content: BRIDGE_WRAPPED_TOKEN_SRC },
      ]);

      const result = verifier.verify(contracts);

      const criticalAccessViolations = result.violations.filter(
        (v) => v.severity === 'critical' && v.category === 'access-control',
      );
      expect(criticalAccessViolations.length).toBe(0);
    });

    it('should detect mint-before-lock ordering violation', () => {
      const contracts = parseSolidityFiles([
        { path: 'MintBeforeLockBridge.sol', content: MINT_BEFORE_LOCK_SRC },
      ]);

      const result = verifier.verify(contracts);

      const orderingViolations = result.violations.filter(
        (v) => v.category === 'conservative-minting' && v.invariant.includes('Ordering'),
      );
      expect(orderingViolations.length).toBeGreaterThan(0);
    });

    it('should not flag correctly ordered lock-then-mint', () => {
      const contracts = parseSolidityFiles([
        { path: 'CorrectBridge.sol', content: CORRECT_BRIDGE_SRC },
      ]);

      const result = verifier.verify(contracts);

      const orderingViolations = result.violations.filter(
        (v) => v.category === 'conservative-minting' && v.invariant.includes('Ordering'),
      );
      expect(orderingViolations.length).toBe(0);
    });

    it('should detect mint without corresponding lock', () => {
      const contracts = parseSolidityFiles([
        { path: 'BadBridgeToken.sol', content: BAD_MINT_CONTRACT_SRC },
      ]);

      const result = verifier.verify(contracts);

      const conservativeViolations = result.violations.filter(
        (v) => v.category === 'conservative-minting',
      );
      expect(conservativeViolations.length).toBeGreaterThan(0);
    });

    it('should produce a valid result structure', () => {
      const contracts = parseSolidityFiles([
        { path: 'CorrectBridge.sol', content: CORRECT_BRIDGE_SRC },
      ]);

      const result = verifier.verify(contracts);

      expect(result.contractsAnalyzed).toBe(1);
      expect(result.functionsAnalyzed).toBeGreaterThan(0);
      expect(result.transitionsDetected).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.contractDetails).toBeDefined();
      expect(result.contractDetails.length).toBe(1);
    });
  });
});
