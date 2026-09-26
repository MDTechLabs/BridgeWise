/**
 * Replay protection detector for cross-chain smart contracts.
 *
 * Scans contract function AST nodes for common replay protection patterns:
 * - Non-reentrant guards (`nonReentrant`, `reentrancyGuard`, `mutex`)
 * - Origin verification (`msg.sender == bridge`, `origin == trusted`)
 * - Message hash tracking (`processedMessages[hash]`, `usedHashes[id]`)
 *
 * Flags any message receiver function that lacks all three protections.
 */

import {
  AstContractNode,
  AstFunctionNode,
  DetectionThresholds,
  SecurityCheckResult,
} from "./types";

const DEFAULT_THRESHOLDS: Required<DetectionThresholds> = {
  minGuardPatterns: 1,
};

const REENTRANCY_PATTERNS = [
  /nonReentrant/i,
  /reentrancyGuard/i,
  /mutex/i,
  /lock\s*=/i,
  /\.lock\(/i,
];

const ORIGIN_CHECK_PATTERNS = [
  /msg\.sender\s*==/i,
  /origin\s*==\s*trusted/i,
  /sourceChain/i,
  /validateOrigin/i,
  /checkOrigin/i,
];

const REPLAY_PROTECTION_PATTERNS = [
  /processedMessages\[/i,
  /usedHashes\[/i,
  /messageId/i,
  /nonceMap\[/i,
  /isUsed\[/i,
  /completedTransactions\[/i,
];

/**
 * Scans contract function AST nodes for replay protection vulnerabilities.
 *
 * @example
 * ```ts
 * const detector = new ReplayDetector();
 * const issues = detector.detectReplayVulnerability(contractNode);
 * ```
 */
export class ReplayDetector {
  private readonly thresholds: Required<DetectionThresholds>;

  constructor(thresholds: DetectionThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Run all replay protection checks on a contract and return any issues found.
   */
  detectReplayVulnerability(node: AstContractNode): SecurityCheckResult[] {
    const issues: SecurityCheckResult[] = [];

    for (const fn of node.functions) {
      const fnIssues = this.checkFunction(fn);
      issues.push(...fnIssues);
    }

    return issues;
  }

  /**
   * Check a single function for replay protection issues.
   */
  private checkFunction(fn: AstFunctionNode): SecurityCheckResult[] {
    const issues: SecurityCheckResult[] = [];

    const hasReentrancy = this.matchesAny(fn, REENTRANCY_PATTERNS);
    const hasOriginCheck = this.matchesAny(fn, ORIGIN_CHECK_PATTERNS);
    const hasReplayProtection = this.matchesAny(fn, REPLAY_PROTECTION_PATTERNS);

    let guardsFound = 0;
    if (hasReentrancy) guardsFound++;
    if (hasOriginCheck) guardsFound++;
    if (hasReplayProtection) guardsFound++;

    if (guardsFound < this.thresholds.minGuardPatterns) {
      issues.push(this.buildMissingReplayIssue(fn));
    }

    if (!hasOriginCheck) {
      issues.push(this.buildMissingOriginIssue(fn));
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

  private buildMissingReplayIssue(fn: AstFunctionNode): SecurityCheckResult {
    return {
      issue: "missing_replay_protection",
      severity: "high",
      description: `Function '${fn.name}' is missing replay protection. Cross-chain message receivers must track processed message hashes to prevent replay attacks.`,
      location: fn.name,
      recommendation:
        "Add a mapping like `mapping(bytes32 => bool) public processedMessages` and set `processedMessages[hash] = true` after processing each message. Check `!processedMessages[hash]` before executing.",
    };
  }

  private buildMissingOriginIssue(fn: AstFunctionNode): SecurityCheckResult {
    return {
      issue: "missing_origin_check",
      severity: "critical",
      description: `Function '${fn.name}' does not verify the origin of cross-chain messages. Without origin validation, any bridge or relayer can invoke this function.`,
      location: fn.name,
      recommendation:
        "Add a check at the start of the function: `require(msg.sender == bridgeAddress, 'unauthorized')` or validate the source chain identifier before executing the message payload.",
    };
  }
}
