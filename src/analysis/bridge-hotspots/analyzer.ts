/**
 * Cross-Chain Smart Contract Security AST Analyzer.
 *
 * Orchestrates replay detection and origin checking across a set of
 * cross-chain contract AST nodes, producing a unified security report.
 *
 * Usage:
 * ```ts
 * import { bridgeSecurityAnalyzer } from "./analyzer";
 * const report = bridgeSecurityAnalyzer.analyzeAll(contracts);
 * ```
 */

import {
  AstContractNode,
  BridgeSecurityAnalysis,
  BridgeSecurityAnalyzerOptions,
  SecurityCheckResult,
} from "./types";
import { ReplayDetector } from "./replay-detector";
import { OriginChecker } from "./origin-checker";

const DEFAULT_OPTIONS: Required<BridgeSecurityAnalyzerOptions> = {
  detectionThresholds: {},
};

/**
 * Orchestrates replay detection and origin checking across cross-chain
 * contract AST nodes to produce a comprehensive security report.
 */
export class BridgeSecurityAnalyzer {
  private readonly options: Required<BridgeSecurityAnalyzerOptions>;
  private readonly replayDetector: ReplayDetector;
  private readonly originChecker: OriginChecker;

  constructor(options: BridgeSecurityAnalyzerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.replayDetector = new ReplayDetector(this.options.detectionThresholds);
    this.originChecker = new OriginChecker();
  }

  /**
   * Run all security checks on a single contract AST node.
   *
   * @example
   * ```ts
   * const contract: AstContractNode = { name: "Bridge", kind: "solidity", functions: [...] };
   * const report = analyzer.analyzeContract(contract);
   * ```
   */
  analyzeContract(contract: AstContractNode): BridgeSecurityAnalysis {
    const issues: SecurityCheckResult[] = [
      ...this.replayDetector.detectReplayVulnerability(contract),
      ...this.originChecker.checkArbitraryExecution(contract),
    ];

    return this.buildReport(issues);
  }

  /**
   * Run all security checks on multiple contract AST nodes.
   *
   * @example
   * ```ts
   * const reports = analyzer.analyzeAll([contract1, contract2]);
   * ```
   */
  analyzeAll(contracts: AstContractNode[]): BridgeSecurityAnalysis {
    const issues: SecurityCheckResult[] = [];

    for (const contract of contracts) {
      issues.push(
        ...this.replayDetector.detectReplayVulnerability(contract),
        ...this.originChecker.checkArbitraryExecution(contract),
      );
    }

    return this.buildReport(issues);
  }

  /**
   * Build a unified security report from a list of detected issues.
   */
  private buildReport(issues: SecurityCheckResult[]): BridgeSecurityAnalysis {
    const totalChecks = issues.length;
    const issueCount = issues.length;
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const highCount = issues.filter((i) => i.severity === "high").length;

    let summary: string;
    if (issueCount === 0) {
      summary = "No security issues detected.";
    } else if (criticalCount > 0) {
      summary = `${criticalCount} critical and ${highCount} high-severity issues found. Immediate action required.`;
    } else if (highCount > 0) {
      summary = `${highCount} high-severity issues found. Review and address before deployment.`;
    } else {
      summary = `${issueCount} issue(s) found. Review recommendations.`;
    }

    return {
      scanTimestamp: Date.now(),
      totalChecks,
      issueCount,
      issues,
      summary,
    };
  }
}

/**
 * Default singleton instance for convenience.
 * Import this when a single analyzer instance is sufficient.
 */
export const bridgeSecurityAnalyzer = new BridgeSecurityAnalyzer();
