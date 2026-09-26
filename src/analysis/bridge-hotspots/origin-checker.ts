/**
 * Origin checker for cross-chain smart contracts.
 *
 * Scans function AST nodes for arbitrary call execution patterns:
 * - `.call()`, `.delegatecall()`, `.staticcall()` with dynamic targets
 * - Missing target contract address allowlisting
 * - Unchecked call success (missing `require(success)`)
 *
 * Flags any function that executes arbitrary calls without proper safeguards.
 */

import {
  AstContractNode,
  AstFunctionNode,
  SecurityCheckResult,
} from "./types";

const CALL_PATTERNS = [
  /\.call\(/,
  /\.delegatecall\(/,
  /\.staticcall\(/,
];

const ALLOWLIST_PATTERNS = [
  /allowedTargets\[/i,
  /whitelist\[/i,
  /trustedContracts\[/i,
  / approved/i,
];

const SUCCESS_CHECK_PATTERNS = [
  /require\s*\(\s*success/i,
  /if\s*\(!\s*success/i,
  /revert\s*if\s*\(!\s*success/i,
];

/**
 * Scans contract functions for arbitrary execution vulnerabilities.
 *
 * @example
 * ```ts
 * const checker = new OriginChecker();
 * const issues = checker.checkArbitraryExecution(contractNode);
 * ```
 */
export class OriginChecker {
  /**
   * Run all origin checks on a contract and return any issues found.
   */
  checkArbitraryExecution(node: AstContractNode): SecurityCheckResult[] {
    const issues: SecurityCheckResult[] = [];

    for (const fn of node.functions) {
      const fnIssues = this.checkFunction(fn);
      issues.push(...fnIssues);
    }

    return issues;
  }

  /**
   * Check a single function for arbitrary call execution issues.
   */
  private checkFunction(fn: AstFunctionNode): SecurityCheckResult[] {
    const issues: SecurityCheckResult[] = [];

    const hasArbitraryCall = CALL_PATTERNS.some((p) => p.test(fn.body));
    if (!hasArbitraryCall) {
      return issues;
    }

    const hasAllowlist = ALLOWLIST_PATTERNS.some((p) =>
      this.matchesAny(fn, ALLOWLIST_PATTERNS),
    );

    if (!hasAllowlist) {
      issues.push(this.buildMissingAllowlistIssue(fn));
    }

    const hasSuccessCheck = SUCCESS_CHECK_PATTERNS.some((p) =>
      p.test(fn.body),
    );

    if (!hasSuccessCheck) {
      issues.push(this.buildUncheckedCallIssue(fn));
    }

    return issues;
  }

  /**
   * Check if any of the patterns match the function's body, modifiers, or calls.
   */
  private matchesAny(fn: AstFunctionNode, patterns: RegExp[]): boolean {
    const haystack = [fn.body, ...fn.modifiers, ...fn.calls].join(" ");
    return patterns.some((p) => p.test(haystack));
  }

  private buildMissingAllowlistIssue(fn: AstFunctionNode): SecurityCheckResult {
    return {
      issue: "arbitrary_call_execution",
      severity: "critical",
      description: `Function '${fn.name}' executes external calls but does not restrict target addresses to an allowlist. This allows calling arbitrary contracts with attacker-controlled payloads.`,
      location: fn.name,
      recommendation:
        "Maintain a mapping of trusted contract addresses (`mapping(address => bool) public allowedTargets`) and check the target against it before each call: `require(allowedTargets[target], 'unauthorized target')`.",
    };
  }

  private buildUncheckedCallIssue(fn: AstFunctionNode): SecurityCheckResult {
    return {
      issue: "arbitrary_call_execution",
      severity: "high",
      description: `Function '${fn.name}' performs external calls without checking the return value. Failed calls will not revert the transaction, potentially leading to silent fund loss or state corruption.`,
      location: fn.name,
      recommendation:
        "Always check the return value of external calls: `(bool success, bytes memory data) = target.call(payload); require(success, 'call failed')`.",
    };
  }
}
