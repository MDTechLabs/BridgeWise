/**
 * @module invariants/types
 * @description Core type definitions for the static invariant checker.
 */

/** Category of a state variable based on its role in bridge invariants. */
export type StateVariableCategory = 'locked' | 'minted' | 'unknown';

/** A contract-level state variable relevant to bridge invariants. */
export interface StateVariable {
  /** Name of the variable (e.g. "lockedReserves", "_totalSupply"). */
  name: string;
  /** Solidity type (e.g. "uint256", "mapping(address => uint256)"). */
  type: string;
  /** Whether the variable tracks locked assets, minted supply, or is uncategorized. */
  category: StateVariableCategory;
  /** The contract this variable belongs to. */
  contractName: string;
  /** Source file path. */
  filePath: string;
  /** Line number where declared. */
  line: number;
}

/** Type of state-modifying operation. */
export type OperationKind = 'add' | 'subtract';

/** Mapping of known operation signatures to their invariant category. */
export interface OperationMapping {
  /** Pattern to match (e.g. "_mint", "vault.lock"). */
  signature: string;
  /** Category: does this increase locked or minted state? */
  category: StateVariableCategory;
  /** Whether this adds or subtracts from the tracked amount. */
  kind: OperationKind;
  /** Description for reporting. */
  description: string;
}

/** A single state-modifying operation detected in a function body. */
export interface StateTransition {
  /** The operation kind. */
  operation: OperationKind;
  /** Category of state affected. */
  category: StateVariableCategory;
  /** Name of the operation (e.g. "_mint", "vault.lock"). */
  operationName: string;
  /** The expression used for the amount (e.g. "amount", "tokenAmount"). */
  amountExpression: string;
  /** The function where this transition occurs. */
  functionName: string;
  /** The contract containing this function. */
  contractName: string;
  /** Source file path. */
  filePath: string;
  /** Line number. */
  line: number;
  /** Context snippet of the source line. */
  context: string;
}

/** A detected function definition within a contract. */
export interface ContractFunction {
  /** Function name. */
  name: string;
  /** Visibility: public, external, internal, private. */
  visibility: string;
  /** Whether the function is a view/pure (read-only). */
  isReadOnly: boolean;
  /** Modifier text between params and body (e.g. 'external onlyRole(MINTER_ROLE) returns (bool)'). */
  modifiersText: string;
  /** Full function body text. */
  body: string;
  /** Contract this function belongs to. */
  contractName: string;
  /** Source file path. */
  filePath: string;
  /** Starting line number. */
  line: number;
  /** Lines of code in the function body. */
  bodyLineCount: number;
  /** State transitions detected in this function. */
  transitions: StateTransition[];
}

/** A parsed contract with its functions and state variables. */
export interface ParsedContract {
  /** Contract name. */
  name: string;
  /** Source file path. */
  filePath: string;
  /** State variables relevant to invariants. */
  stateVariables: StateVariable[];
  /** Functions defined in the contract. */
  functions: ContractFunction[];
  /** Inherited contracts detected from `is` clause. */
  inherits: string[];
  /** Total lines in the file. */
  lineCount: number;
}

/** A single invariant violation detected during analysis. */
export interface InvariantViolation {
  /** The specific invariant being violated. */
  invariant: string;
  /** Human-readable description of the violation. */
  description: string;
  /** The execution path (contract → function chain) where the violation occurs. */
  path: string;
  /** Source location: file:line. */
  sourceLocation: string;
  /** Severity of the violation. */
  severity: 'critical' | 'warning' | 'info';
  /** The category of the invariant. */
  category: 'solvency' | 'conservative-minting' | 'access-control';
}

/** Result of running invariant checks on a set of contracts. */
export interface InvariantCheckResult {
  /** Whether all invariants are satisfied. */
  allInvariantsSatisfied: boolean;
  /** Total number of contracts analyzed. */
  contractsAnalyzed: number;
  /** Total number of functions analyzed. */
  functionsAnalyzed: number;
  /** Total number of state transitions detected. */
  transitionsDetected: number;
  /** List of invariant violations found. */
  violations: InvariantViolation[];
  /** Summary message. */
  summary: string;
  /** Per-contract detailed analysis. */
  contractDetails: Array<{
    contractName: string;
    filePath: string;
    functionsScanned: number;
    lockedVariables: string[];
    mintedVariables: string[];
    transitions: number;
    violations: number;
  }>;
}
