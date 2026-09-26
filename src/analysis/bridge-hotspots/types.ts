/**
 * Types for cross-chain smart contract security AST analysis.
 *
 * Defines the AST node representation for cross-chain contracts and the
 * security check results produced by the hotspot detectors.
 */

/**
 * Categories of cross-chain security vulnerabilities detected.
 */
export type BridgeSecurityIssue =
  | "missing_replay_protection"
  | "missing_origin_check"
  | "arbitrary_call_execution";

/**
 * Severity level for a detected security issue.
 */
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

/**
 * Result of a single security check performed on a contract function.
 */
export interface SecurityCheckResult {
  /** The type of security issue detected. */
  issue: BridgeSecurityIssue;
  /** Severity level indicating the risk posed by this issue. */
  severity: SecuritySeverity;
  /** Human-readable description of the vulnerability. */
  description: string;
  /** Location within the contract where the issue was found (function name or line). */
  location: string;
  /** Recommended fix for the detected vulnerability. */
  recommendation: string;
}

/**
 * Full security analysis result for one or more cross-chain contracts.
 */
export interface BridgeSecurityAnalysis {
  /** Unix timestamp (ms) when the scan was performed. */
  scanTimestamp: number;
  /** Total number of security checks performed. */
  totalChecks: number;
  /** How many issues were found. */
  issueCount: number;
  /** Detailed list of all detected security issues. */
  issues: SecurityCheckResult[];
  /** One-line summary of the overall security posture. */
  summary: string;
}

/**
 * Represents a parsed cross-chain contract with its functions.
 */
export interface AstContractNode {
  /** Contract name. */
  name: string;
  /** Contract kind (e.g. "solidity", "rust"). */
  kind: string;
  /** All functions defined in the contract. */
  functions: AstFunctionNode[];
}

/**
 * Represents a single function within a parsed cross-chain contract.
 */
export interface AstFunctionNode {
  /** Function name. */
  name: string;
  /** Raw function body or signature text for pattern scanning. */
  body: string;
  /** List of modifier names applied to this function (e.g. nonReentrant). */
  modifiers: string[];
  /** List of external contract calls made within this function. */
  calls: string[];
}

/**
 * Threshold configuration for replay detection sensitivity.
 */
export interface DetectionThresholds {
  /** Minimum number of guard patterns required to consider a function protected. */
  minGuardPatterns?: number;
}

/**
 * Configuration options for the bridge security analyzer.
 */
export interface BridgeSecurityAnalyzerOptions {
  /** Threshold configuration passed to the replay detector. */
  detectionThresholds?: DetectionThresholds;
}
