import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';
import * as fs from 'fs';
import * as path from 'path';

export type InvariantType =
  | 'total-pool-liquidity'
  | 'mint-exceeds-deposit'
  | 'unauthorized-mint'
  | 'missing-replay-protection'
  | 'missing-origin-validation'
  | 'missing-access-control'
  | 'arbitrary-call-execution'
  | 'nonce-monotonicity';

export interface InvariantViolation {
  invariant: InvariantType;
  contractName: string;
  functionName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

export interface InvariantCheckResult {
  contractsScanned: number;
  functionsScanned: number;
  invariantsChecked: number;
  violationsFound: number;
  violations: InvariantViolation[];
}

interface ParsedFunction {
  name: string;
  body: string;
  modifiers: string[];
  calls: string[];
  stateVariables: string[];
}

interface ParsedContract {
  name: string;
  functions: ParsedFunction[];
}

function parseSolidityContracts(source: string): ParsedContract[] {
  const contracts: ParsedContract[] = [];
  const contractRegex = /contract\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = contractRegex.exec(source)) !== null) {
    const contractName = match[1];
    const contractBody = match[2];
    const functions: ParsedFunction[] = [];

    const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(.*?)\{([\s\S]*?)\}/g;
    let funcMatch: RegExpExecArray | null;

    while ((funcMatch = funcRegex.exec(contractBody)) !== null) {
      const funcName = funcMatch[1];
      const params = funcMatch[2];
      const modifiers = funcMatch[3].trim().split(/\s+/).filter(Boolean);
      const funcBody = funcMatch[4];

      const callPatterns = [
        ...funcBody.matchAll(/\.(\w+)\s*\(/g),
      ].map(m => m[1]);

      const stateVars: string[] = [];
      const stateVarPatterns = [
        ...funcBody.matchAll(/(\w+)\s*[+=-]=\s*[^;]+/g),
      ].map(m => m[1]);

      functions.push({
        name: funcName,
        body: funcBody,
        modifiers,
        calls: [...new Set(callPatterns)],
        stateVariables: [...new Set(stateVars.concat(stateVarPatterns))],
      });
    }

    contracts.push({ name: contractName, functions });
  }

  return contracts;
}

function checkTotalPoolLiquidity(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const isDeposit = /deposit|mint|stake/i.test(fn.name) && fn.calls.some(c => /mint|transfer/i.test(c));
  const isWithdraw = /withdraw|redeem|unstake/i.test(fn.name);

  if (!isDeposit && !isWithdraw) return null;

  const updatesShares = fn.stateVariables.some(v => /share|lpToken|token/i.test(v));
  const updatesPool = fn.stateVariables.some(v => /pool|liquidity|totalSupply|reserve/i.test(v));

  const hasProportionalUpdate = fn.body.match(/(\w+)\s*=\s*(\w+)\s*[+\-*\/]\s*\w+\s*[+\-*\/]\s*\w+/);

  if (updatesShares && updatesPool && !hasProportionalUpdate) {
    return {
      invariant: 'total-pool-liquidity',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'high',
      description: `Function '${fn.name}' updates both shares and pool state but may not maintain the invariant ∑Shares ≡ TotalPoolLiquidity. Share and liquidity updates must be proportional to prevent value extraction.`,
      recommendation: 'Ensure share allocations are proportional to pool liquidity changes. Use a constant-product or fixed-ratio formula: shares = (amount * totalShares) / totalLiquidity.',
    };
  }

  return null;
}

function checkMintExceedsDeposit(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const isMint = fn.name.match(/mint|bridge|receive|unlock/i) &&
    fn.body.match(/_mint|mint\(|\.mint|transfer\(/i);

  if (!isMint) return null;

  const hasDepositCheck = fn.body.match(/deposit|lock|burn|collected|totalDeposited/i) ||
    fn.modifiers.some(m => /onlyBridge|onlyRelayer|whenNotPaused/i.test(m));

  const hasBalanceTracking = fn.body.match(/balance|amount.*[<>]|require.*[<>]|needs.*deposit|limit/i);

  if (!hasDepositCheck && !hasBalanceTracking) {
    return {
      invariant: 'mint-exceeds-deposit',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'critical',
      description: `Function '${fn.name}' performs mint/transfer operations without verifying corresponding deposits were locked on the source chain. This could allow minting tokens exceeding locked collateral.`,
      recommendation: 'Add a deposit tracking mechanism: mapping(bytes32 => uint256) public deposits and verify mint amount <= deposits[msg.sender] before minting.',
    };
  }

  return null;
}

function checkReplayProtection(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const isMessageHandler = fn.body.match(/message|payload|nonce|packet/i) ||
    fn.modifiers.some(m => /external|public/i.test(m)) ||
    fn.name.match(/receive|execute|process|handle/i);

  if (!isMessageHandler) return null;

  const hasReplayGuard = fn.body.match(/processedMessages\[|usedHashes\[|nonceMap\[|isUsed\[|completedTransactions\[|messageId\[/i) ||
    fn.modifiers.some(m => /nonReentrant|reentrancyGuard/i.test(m));

  if (!hasReplayGuard) {
    return {
      invariant: 'missing-replay-protection',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'critical',
      description: `Function '${fn.name}' processes cross-chain messages without replay protection. An attacker can replay the same message multiple times, causing double-spend of bridged assets.`,
      recommendation: 'Add a mapping to track processed message hashes: mapping(bytes32 => bool) public processedMessages. Check !processedMessages[hash] before execution and set processedMessages[hash] = true after.',
    };
  }

  return null;
}

function checkOriginValidation(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const isCrossChainReceiver = fn.name.match(/receive|execute|process|handle|bridge|finalize/i) &&
    fn.body.match(/message|payload|nonce|sourceChain|origin/i);

  if (!isCrossChainReceiver) return null;

  const hasOriginCheck = fn.body.match(/msg\.sender\s*==|origin\s*==|sourceChain|validateOrigin|checkOrigin|require.*sender|onlyBridge/i) ||
    fn.modifiers.some(m => /only(Bridge|Relayer|Validator|Role)/i.test(m));

  if (!hasOriginCheck) {
    return {
      invariant: 'missing-origin-validation',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'critical',
      description: `Function '${fn.name}' processes cross-chain messages without validating the origin sender. Any address can invoke this function with forged messages.`,
      recommendation: 'Add origin validation: require(msg.sender == bridgeAddress, "unauthorized") and verify the source chain identifier matches the expected chain before executing the message payload.',
    };
  }

  return null;
}

function checkAccessControl(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const isSensitive = fn.body.match(/_mint|mint\(|set[^)]*\(|update[^)]*\(|pause[^)]*\(|unpause[^)]*\(|withdraw|transferOwnership|grantRole/i) &&
    !fn.name.match(/constructor|initialize/i);

  if (!isSensitive) return null;

  const hasAccessControl = fn.modifiers.some(m => /onlyOwner|only(Role|Admin|Governance|Bridge|Relayer)|whenNotPaused/i.test(m)) ||
    fn.body.match(/require.*owner|require.*role|require.*admin|onlyOwner|hasRole|auth\[/i);

  if (!hasAccessControl) {
    return {
      invariant: 'missing-access-control',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'high',
      description: `Function '${fn.name}' performs sensitive operations but lacks access control modifiers. Any caller can invoke this function and modify critical state.`,
      recommendation: 'Add an access control modifier such as onlyOwner (Ownable) or a custom RBAC modifier that restricts access to authorized roles.',
    };
  }

  return null;
}

function checkArbitraryCall(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const hasArbitraryCall = fn.body.match(/\.call\s*\{|\.delegatecall\s*\{|\.staticcall\s*\{/i) &&
    fn.body.match(/(target|addr|to|destination)\s*=\s*\w+/i);

  if (!hasArbitraryCall) return null;

  const hasAllowlist = fn.body.match(/allowlist\[|whitelist\[|approvedTarget\[|isTrusted|validTarget|onlyAllowed/i);

  if (!hasAllowlist) {
    return {
      invariant: 'arbitrary-call-execution',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'critical',
      description: `Function '${fn.name}' performs external calls without verifying the target against an allowlist. An attacker who controls the target parameter can execute arbitrary code.`,
      recommendation: 'Maintain an allowlist mapping: mapping(address => bool) public allowedTargets. Check require(allowedTargets[target]) before performing the external call.',
    };
  }

  return null;
}

function checkNonceMonotonicity(contract: ParsedContract, fn: ParsedFunction): InvariantViolation | null {
  const usesNonce = fn.body.match(/nonce|messageId|sequenceId|outbound/i);

  if (!usesNonce) return null;

  const hasMonotonicUpdate = fn.body.match(/nonce\+\+|nonce\s*=\s*\w+\s*\+\s*1|nonce\s*[+]=|nonces\[.*\]\+\+|messageId\+\+|nonce\s*=.*increment/i);

  if (!hasMonotonicUpdate) {
    return {
      invariant: 'nonce-monotonicity',
      contractName: contract.name,
      functionName: fn.name,
      severity: 'medium',
      description: `Function '${fn.name}' references nonce values without a strictly monotonically increasing update. This could lead to nonce reuse or out-of-order message processing.`,
      recommendation: 'Ensure nonces are strictly incremented using nonce++ or similar monotonic operations. Consider using OpenZeppelin Counters or a dedicated nonce manager.',
    };
  }

  return null;
}

const INVARIANT_CHECKS: Array<{
  name: InvariantType;
  check: (contract: ParsedContract, fn: ParsedFunction) => InvariantViolation | null;
  label: string;
}> = [
  { name: 'total-pool-liquidity', check: checkTotalPoolLiquidity, label: '∑Shares ≡ TotalPoolLiquidity' },
  { name: 'mint-exceeds-deposit', check: checkMintExceedsDeposit, label: 'Mint ≤ Deposit' },
  { name: 'missing-replay-protection', check: checkReplayProtection, label: 'Replay Protection' },
  { name: 'missing-origin-validation', check: checkOriginValidation, label: 'Origin Validation' },
  { name: 'missing-access-control', check: checkAccessControl, label: 'Access Control' },
  { name: 'arbitrary-call-execution', check: checkArbitraryCall, label: 'Arbitrary Call Prevention' },
  { name: 'nonce-monotonicity', check: checkNonceMonotonicity, label: 'Nonce Monotonicity' },
];

export function runInvariantChecker(contracts: ParsedContract[]): InvariantCheckResult {
  const violations: InvariantViolation[] = [];
  let functionsScanned = 0;

  for (const contract of contracts) {
    for (const fn of contract.functions) {
      functionsScanned++;
      for (const invariant of INVARIANT_CHECKS) {
        const violation = invariant.check(contract, fn);
        if (violation) {
          violations.push(violation);
        }
      }
    }
  }

  return {
    contractsScanned: contracts.length,
    functionsScanned,
    invariantsChecked: functionsScanned * INVARIANT_CHECKS.length,
    violationsFound: violations.length,
    violations,
  };
}

export function scanContractFiles(filePaths: string[]): ParsedContract[] {
  const allContracts: ParsedContract[] = [];

  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved, { recursive: true }) as string[];
      const solFiles = entries.filter(e => e.endsWith('.sol')).map(e => path.join(resolved, e));
      for (const solFile of solFiles) {
        const source = fs.readFileSync(solFile, 'utf-8');
        const contracts = parseSolidityContracts(source);
        allContracts.push(...contracts);
      }
    } else if (stat.isFile() && resolved.endsWith('.sol')) {
      const source = fs.readFileSync(resolved, 'utf-8');
      const contracts = parseSolidityContracts(source);
      allContracts.push(...contracts);
    }
  }

  return allContracts;
}

@Injectable()
export class InvariantsCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'check-invariants',
    description: 'Statically verify core mathematical invariants across bridge contract ASTs',
    usage: 'bridgewise check-invariants --path <contract_path> [--format text|json]',
    aliases: ['invariants', 'inv-check'],
    options: [
      {
        name: 'path',
        alias: 'p',
        description: 'Path to Solidity contract file or directory containing .sol files',
        required: true,
        type: 'string',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<InvariantCheckResult>> {
    const contractPath = options.path || args[0];
    if (!contractPath) {
      return {
        success: false,
        command: this.definition.name,
        error: 'Contract path is required. Specify via --path <path> or as first argument.',
        timestamp: new Date().toISOString(),
      };
    }

    const resolvedPath = path.resolve(contractPath);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        command: this.definition.name,
        error: `Contract path not found: ${resolvedPath}`,
        timestamp: new Date().toISOString(),
      };
    }

    let contracts: ParsedContract[];
    try {
      const solFiles: string[] = [];
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(resolvedPath, { recursive: true }) as string[];
        solFiles.push(...entries.filter(e => e.endsWith('.sol')).map(e => path.join(resolvedPath, e)));
      } else if (resolvedPath.endsWith('.sol')) {
        solFiles.push(resolvedPath);
      } else {
        return {
          success: false,
          command: this.definition.name,
          error: 'Unsupported file type. Provide a .sol file or a directory containing .sol files.',
          timestamp: new Date().toISOString(),
        };
      }

      if (solFiles.length === 0) {
        return {
          success: false,
          command: this.definition.name,
          error: 'No .sol files found in the specified path.',
          timestamp: new Date().toISOString(),
        };
      }

      const allContracts: ParsedContract[] = [];
      for (const solFile of solFiles) {
        const source = fs.readFileSync(solFile, 'utf-8');
        const parsed = parseSolidityContracts(source);
        allContracts.push(...parsed);
      }
      contracts = allContracts;
    } catch (err: any) {
      return {
        success: false,
        command: this.definition.name,
        error: `Failed to parse contracts: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }

    if (contracts.length === 0) {
      return {
        success: false,
        command: this.definition.name,
        error: 'No Solidity contracts found in the specified path.',
        timestamp: new Date().toISOString(),
      };
    }

    const result = runInvariantChecker(contracts);

    return {
      success: result.violations.length > 0 ? false : true,
      command: this.definition.name,
      data: result,
      message: `Scanned ${result.contractsScanned} contract(s): ${result.violationsFound} invariant violation(s) found.`,
      timestamp: new Date().toISOString(),
    };
  }
}
