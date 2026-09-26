/**
 * @module invariants/state_verifier
 * @description Evaluates state transitions across parsed contracts against
 *              mathematical bridge invariants.
 *
 * Primary invariants checked:
 *   1. SOLVENCY:        TotalLockedReserves >= TotalMintedWrappedTokens
 *   2. CONSERVATIVE-MINTING: ΔLocked >= ΔMinted on every execution path
 *   3. ACCESS-CONTROL:  Mint/burn operations are properly role-gated
 */

import {
  ContractFunction,
  InvariantCheckResult,
  InvariantViolation,
  ParsedContract,
  StateTransition,
} from './types';

/**
 * Core invariant verifier. Accepts parsed contracts and produces a detailed
 * report of invariant violations.
 */
export class StateVerifier {
  // -----------------------------------------------------------------------
  // Public entry point
  // -----------------------------------------------------------------------

  /**
   * Run all invariants against the parsed contracts and return a structured
   * result suitable for CLI output or CI/CD consumption.
   */
  verify(contracts: ParsedContract[]): InvariantCheckResult {
    const violations: InvariantViolation[] = [];
    let totalTransitions = 0;
    let totalFunctions = 0;

    const contractDetails: InvariantCheckResult['contractDetails'] = [];

    for (const contract of contracts) {
      const lockedVars = contract.stateVariables
        .filter((v) => v.category === 'locked')
        .map((v) => v.name);
      const mintedVars = contract.stateVariables
        .filter((v) => v.category === 'minted')
        .map((v) => v.name);

      let contractTransitions = 0;
      let contractFunctionsScanned = 0;

      for (const func of contract.functions) {
        if (func.isReadOnly) continue; // view/pure functions don't modify state

        contractFunctionsScanned++;
        totalFunctions++;
        contractTransitions += func.transitions.length;
        totalTransitions += func.transitions.length;

        // Check invariants on each state-modifying function
        violations.push(
          ...this.checkConservativeMinting(func, contracts),
          ...this.checkAtomicLockMint(func, contracts),
          ...this.checkAccessControl(func),
        );
      }

      const contractViolations = violations.filter(
        (v) => v.sourceLocation.startsWith(contract.filePath),
      );

      contractDetails.push({
        contractName: contract.name,
        filePath: contract.filePath,
        functionsScanned: contractFunctionsScanned,
        lockedVariables: lockedVars,
        mintedVariables: mintedVars,
        transitions: contractTransitions,
        violations: contractViolations.length,
      });
    }

    // Check cross-contract solvency
    violations.push(...this.checkCrossContractSolvency(contracts));

    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const allSatisfied = criticalCount === 0;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const infoCount = violations.filter((v) => v.severity === 'info').length;

    const summary = allSatisfied
      ? `✅ All invariants satisfied across ${contracts.length} contract(s), ${totalFunctions} function(s), ${totalTransitions} transition(s).`
      : `❌ Found ${criticalCount} critical, ${warningCount} warning, ${infoCount} info violation(s) across ${contracts.length} contract(s).`;

    return {
      allInvariantsSatisfied: allSatisfied,
      contractsAnalyzed: contracts.length,
      functionsAnalyzed: totalFunctions,
      transitionsDetected: totalTransitions,
      violations,
      summary,
      contractDetails,
    };
  }

  // -----------------------------------------------------------------------
  // Invariant 1: Conservative Minting
  //
  //   For every function that mints, there must be a corresponding lock
  //   operation whose amount is >= the mint amount on the same execution
  //   path (or a prior lock that has been verified on-chain).
  // -----------------------------------------------------------------------

  private checkConservativeMinting(
    func: ContractFunction,
    allContracts: ParsedContract[],
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    const mints = func.transitions.filter(
      (t) => t.category === 'minted' && t.operation === 'add',
    );
    const locks = func.transitions.filter(
      (t) => t.category === 'locked' && t.operation === 'add',
    );
    const burns = func.transitions.filter(
      (t) => t.category === 'minted' && t.operation === 'subtract',
    );

    // If there are mint operations but no lock operations in the same function,
    // flag it as a potential violation (needs further cross-function analysis).
    for (const mint of mints) {
      // Check if there's a corresponding lock in this function
      const hasLocalLock = locks.length > 0;

      // Check if this function is called by a function that locks
      // (e.g. a vault's lock function calls an internal _deposit)
      const callerLocks = this.findCallersWithOperation(
        func,
        allContracts,
        'locked',
        'add',
      );

      // Check if the mint is gated by a role that only the vault can call
      // (which implies the vault already did the lock)
      const isPrivilegedMint = this.isPrivilegedContext(func, mint);

      if (!hasLocalLock && callerLocks.length === 0 && !isPrivilegedMint) {
        violations.push({
          invariant: 'Conservative Minting (ΔLocked >= ΔMinted)',
          description: `Function '${func.name}' mints tokens (via '${mint.operationName}') without a corresponding lock operation in the same execution path. This could allow minting without backing reserves.`,
          path: `${func.contractName} → ${func.name}()`,
          sourceLocation: `${func.filePath}:${mint.line}`,
          severity: 'critical',
          category: 'conservative-minting',
        });
      } else if (hasLocalLock) {
        // Verify the amounts: lock amount should be >= mint amount
        // This is a symbolic check — we note it but don't flag as critical
        // since runtime values may differ.
        const mintExpr = mint.amountExpression;
        const lockExprs = locks.map((l) => l.amountExpression);

        // If mint uses a different variable than locks, that's suspicious
        const allMatch = lockExprs.some(
          (le) =>
            le === mintExpr ||
            le.includes(mintExpr) ||
            mintExpr.includes(le),
        );

        if (!allMatch && !isPrivilegedMint) {
          violations.push({
            invariant: 'Conservative Minting (ΔLocked >= ΔMinted)',
            description: `Function '${func.name}' mints with expression '${mintExpr}' but locks with '${lockExprs.join(', ')}'. The lock amount may not cover the mint amount.`,
            path: `${func.contractName} → ${func.name}()`,
            sourceLocation: `${func.filePath}:${mint.line}`,
            severity: 'warning',
            category: 'conservative-minting',
          });
        }
      }
    }

    return violations;
  }

  // -----------------------------------------------------------------------
  // Invariant 2: Atomic Lock-Mint Pairs
  //
  //   Lock and mint operations on the same logical transfer should appear
  //   as an ordered pair: lock → mint. If mint appears before lock,
  //   there's a re-entrancy / ordering risk.
  // -----------------------------------------------------------------------

  private checkAtomicLockMint(
    func: ContractFunction,
    _allContracts: ParsedContract[],
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    const transitions = func.transitions;

    // Find the first mint and last lock in the function body
    let firstMintLine: number | null = null;
    let lastLockLine: number | null = null;

    for (const t of transitions) {
      if (t.category === 'minted' && t.operation === 'add') {
        if (firstMintLine === null || t.line < firstMintLine) {
          firstMintLine = t.line;
        }
      }
      if (t.category === 'locked' && t.operation === 'add') {
        if (lastLockLine === null || t.line > lastLockLine) {
          lastLockLine = t.line;
        }
      }
    }

    // If mint happens before the lock operation, flag it
    if (
      firstMintLine !== null &&
      lastLockLine !== null &&
      firstMintLine < lastLockLine
    ) {
      violations.push({
        invariant: 'Atomic Lock-Mint Ordering',
        description: `Function '${func.name}' mints tokens (line ${firstMintLine}) before locking assets (line ${lastLockLine}). Mint should occur after the lock to prevent re-entrancy and ensure backing reserves exist first.`,
        path: `${func.contractName} → ${func.name}()`,
        sourceLocation: `${func.filePath}:${firstMintLine}`,
        severity: 'warning',
        category: 'conservative-minting',
      });
    }

    return violations;
  }

  // -----------------------------------------------------------------------
  // Invariant 3: Access Control on Mint/Burn
  //
  //   Mint and burn functions must be guarded by role checks or access
  //   modifiers. Unguarded mint functions are a critical vulnerability.
  // -----------------------------------------------------------------------

  private checkAccessControl(func: ContractFunction): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    // Check both the modifiers text (function signature) and the body
    const combinedText = `${func.modifiersText} ${func.body}`;

    const hasMintOrBurn = func.transitions.some(
      (t) => t.category === 'minted',
    );

    if (!hasMintOrBurn) return violations;

    // Check for common access control patterns in modifiers + body
    const hasRoleCheck =
      /\bonlyRole\b/.test(combinedText) ||
      /\brequire\s*\(\s*(?:msg\.sender\s*==|hasRole)/.test(combinedText) ||
      /\brequire\s*\(\s*.+\s*==\s*owner/.test(combinedText) ||
      /\bonlyOwner\b/.test(combinedText) ||
      /\bonlyVault\b/.test(combinedText) ||
      /\bonlyBridge\b/.test(combinedText);

    // Check if function visibility is external/public (less safe if unguarded)
    const isPublic =
      func.visibility === 'public' || func.visibility === 'external';

    if (!hasRoleCheck && isPublic) {
      violations.push({
        invariant: 'Access Control on Mint/Burn',
        description: `Function '${func.name}' performs mint/burn operations with '${func.visibility}' visibility but no access control modifier (onlyRole, onlyOwner, etc.) was detected. This could allow unauthorized token minting.`,
        path: `${func.contractName} → ${func.name}()`,
        sourceLocation: `${func.filePath}:${func.line}`,
        severity: 'critical',
        category: 'access-control',
      });
    } else if (!hasRoleCheck && !isPublic) {
      violations.push({
        invariant: 'Access Control on Mint/Burn',
        description: `Function '${func.name}' performs mint/burn operations with '${func.visibility}' visibility but no explicit access control was detected. Verify that callers enforce access control.`,
        path: `${func.contractName} → ${func.name}()`,
        sourceLocation: `${func.filePath}:${func.line}`,
        severity: 'info',
        category: 'access-control',
      });
    }

    return violations;
  }

  // -----------------------------------------------------------------------
  // Cross-contract solvency check
  //
  //   Across all contracts, ensure there is at least one contract that
  //   enforces the solvency invariant (locked >= minted) at the system
  //   level — typically a VaultHealthEvaluator or equivalent.
  // -----------------------------------------------------------------------

  private checkCrossContractSolvency(
    contracts: ParsedContract[],
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    // Check if any contract explicitly enforces the locked >= minted invariant
    const hasHealthCheck = contracts.some((c) => {
      const allBodyText = c.functions.map((f) => f.body).join(' ');
      return (
        /\blockedReserves\b.*\btotalSupply\b/.test(allBodyText) ||
        /\btotalLocked\b.*\btotalMinted\b/.test(allBodyText) ||
        /\btotalSupply\b.*\blockedReserves\b/.test(allBodyText) ||
        /collateralization/i.test(c.name) ||
        /health/i.test(c.name) ||
        /solvency/i.test(c.name)
      );
    });

    if (!hasHealthCheck) {
      violations.push({
        invariant: 'Cross-Contract Solvency',
        description:
          'No contract was detected that enforces the system-level solvency invariant (total locked reserves >= total minted wrapped supply). Consider adding an on-chain health checker like VaultHealthEvaluator.',
        path: 'system-wide',
        sourceLocation: contracts[0]?.filePath ?? 'unknown',
        severity: 'warning',
        category: 'solvency',
      });
    }

    // Check if locked state variables exist but no minted counterpart (or vice versa)
    for (const contract of contracts) {
      const hasLockedVars = contract.stateVariables.some(
        (v) => v.category === 'locked',
      );
      const hasMintedVars = contract.stateVariables.some(
        (v) => v.category === 'minted',
      );

      if (hasLockedVars && !hasMintedVars) {
        violations.push({
          invariant: 'Cross-Contract Solvency',
          description: `Contract '${contract.name}' tracks locked reserves but has no corresponding minted/wrapped token supply variable. Ensure the invariant is checked elsewhere.`,
          path: `${contract.name}`,
          sourceLocation: `${contract.filePath}:1`,
          severity: 'info',
          category: 'solvency',
        });
      }

      if (!hasLockedVars && hasMintedVars) {
        violations.push({
          invariant: 'Cross-Contract Solvency',
          description: `Contract '${contract.name}' manages minted tokens but has no corresponding locked reserves variable. The solvency invariant (locked >= minted) cannot be verified within this contract.`,
          path: `${contract.name}`,
          sourceLocation: `${contract.filePath}:1`,
          severity: 'warning',
          category: 'solvency',
        });
      }
    }

    return violations;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Find functions across all contracts that call the given function and
   * contain the specified type of operation.
   * Uses word-boundary matching to avoid false substring matches.
   */
  private findCallersWithOperation(
    func: ContractFunction,
    allContracts: ParsedContract[],
    category: StateTransition['category'],
    operation: StateTransition['operation'],
  ): ContractFunction[] {
    const callers: ContractFunction[] = [];
    // Match function calls with word boundary: `funcName(` or `.funcName(`
    const callPattern = new RegExp(
      `(?:\\b|\\.)${this.escapeRegex(func.name)}\\s*\\(`,
    );
    for (const contract of allContracts) {
      for (const f of contract.functions) {
        if (callPattern.test(f.body)) {
          const hasOp = f.transitions.some(
            (t) => t.category === category && t.operation === operation,
          );
          if (hasOp) callers.push(f);
        }
      }
    }
    return callers;
  }

  /**
   * Escape regex special characters in a string.
   */
  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Determine if a mint operation is within a privileged context — i.e.,
   * the function has role-based access control that only the bridge vault
   * can satisfy, which implies the lock already happened.
   */
  private isPrivilegedContext(
    func: ContractFunction,
    _mint: StateTransition,
  ): boolean {
    // Check both modifiers (function signature) and body for access-control patterns
    const combined = `${func.modifiersText} ${func.body}`;
    return (
      /\bonlyRole\b/.test(combined) ||
      /\bMINTER_ROLE\b/.test(combined) ||
      /\bminter\b/i.test(combined) ||
      /\brequire\s*\(\s*hasRole/.test(combined) ||
      /\brequire\s*\(\s*msg\.sender\s*==\s*\w+[Vv]ault/.test(combined)
    );
  }
}
