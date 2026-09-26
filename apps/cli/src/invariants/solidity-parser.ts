/**
 * @module invariants/solidity-parser
 * @description Lightweight regex-based Solidity source parser for static invariant analysis.
 *
 * Extracts:
 *   - Contract declarations & inheritance
 *   - State variables with balance semantics
 *   - Function definitions with visibility and body
 *   - State-modifying operations (mint, burn, lock, transfers)
 */

import {
  ContractFunction,
  OperationMapping,
  ParsedContract,
  StateTransition,
  StateVariable,
} from './types';

// ---------------------------------------------------------------------------
// Known operation signatures mapped to their invariant category
// ---------------------------------------------------------------------------

/**
 * Recognised state-modifying operations and their categories.
 * When adding new bridge adapters / contracts, extend this table.
 */
const OPERATION_MAPPINGS: OperationMapping[] = [
  // --- Mint operations (increase minted supply) ---
  {
    signature: '_mint',
    category: 'minted',
    kind: 'add',
    description: 'Mints new wrapped tokens, increasing total supply.',
  },
  {
    signature: '.mint',
    category: 'minted',
    kind: 'add',
    description: 'Mints new wrapped tokens via ERC-20 mint.',
  },
  // --- Burn operations (decrease minted supply) ---
  {
    signature: '_burn',
    category: 'minted',
    kind: 'subtract',
    description: 'Burns wrapped tokens, decreasing total supply.',
  },
  {
    signature: 'burnFrom',
    category: 'minted',
    kind: 'subtract',
    description: 'Burns wrapped tokens from a specific account.',
  },
  {
    signature: '.burn',
    category: 'minted',
    kind: 'subtract',
    description: 'Burns wrapped tokens via ERC-20 burn.',
  },
  // --- Lock operations (increase locked reserves) ---
  {
    signature: '.lock(',
    category: 'locked',
    kind: 'add',
    description: 'Locks assets in the bridge vault, increasing locked reserves.',
  },
  {
    signature: 'safeTransferFrom',
    category: 'locked',
    kind: 'add',
    description: 'Transfers tokens into the vault, increasing locked reserves.',
  },
  {
    signature: '.deposit',
    category: 'locked',
    kind: 'add',
    description: 'Wraps native token (e.g. ETH → WETH), increasing locked token balance.',
  },
  // --- Release operations (decrease locked reserves) ---
  {
    signature: '.release(',
    category: 'locked',
    kind: 'subtract',
    description: 'Releases locked assets from the vault.',
  },
  {
    signature: '.unlock(',
    category: 'locked',
    kind: 'subtract',
    description: 'Unlocks assets from the vault.',
  },
];

// ---------------------------------------------------------------------------
// State variable heuristics
// ---------------------------------------------------------------------------

/** Patterns that suggest a state variable tracks locked reserves. */
const LOCKED_PATTERNS = [
  /locked/i,
  /reserve/i,
  /holding/i,
  /deposit/i,
  /vault_?balance/i,
];

/** Patterns that suggest a state variable tracks minted/wrapped supply. */
const MINTED_PATTERNS = [
  /minted/i,
  /supply/i,
  /wrapped/i,
  /outstanding/i,
  /totalsupply/i,
];

/**
 * Classify a state variable name into a category.
 */
function classifyVariable(name: string): 'locked' | 'minted' | 'unknown' {
  for (const pat of LOCKED_PATTERNS) {
    if (pat.test(name)) return 'locked';
  }
  for (const pat of MINTED_PATTERNS) {
    if (pat.test(name)) return 'minted';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Source normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Strip single-line (// ...) and multi-line (/* ... *​/) comments from
 * Solidity source so they don't interfere with regex matching.
 *
 * Also normalises strings to avoid comment-like patterns inside them.
 */
function stripComments(source: string): string {
  // Temporarily replace string literals to protect comment-like patterns inside them
  const strings: string[] = [];
  let cleaned = source.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    strings.push(match);
    return `__STRING_${strings.length - 1}__`;
  });
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
    strings.push(match);
    return `__STRING_${strings.length - 1}__`;
  });

  // Remove multi-line comments first
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  // Restore string literals
  cleaned = cleaned.replace(/__STRING_(\d+)__/g, (_, i) => strings[parseInt(i)] ?? '');

  return cleaned;
}

/**
 * Collapse runs of whitespace into a single space for easier regex matching.
 */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Parsing functions
// ---------------------------------------------------------------------------

/**
 * Extract the contract name from a contract declaration line.
 * Handles: `contract Foo`, `abstract contract Foo`, `contract Foo is Bar, Baz`
 */
function extractContractName(line: string): string | null {
  const m = /(?:abstract\s+)?contract\s+(\w+)/i.exec(line);
  return m ? m[1] : null;
}

/**
 * Extract inherited contract names from the `is` clause.
 */
function extractInherits(line: string): string[] {
  const m = /contract\s+\w+\s+is\s+([^{]+)/i.exec(line);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\w+/.test(s))
    .map((s) => s.match(/^(\w+)/)?.[1] ?? s);
}

/**
 * Extract state variable declarations from a contract body.
 * Matches common Solidity patterns including user-defined types:
 *   uint256 public lockedReserves;
 *   mapping(address => uint256) private _balances;
 *   IERC20 public token;
 *   MyStruct public myVar;
 */
function extractStateVariables(
  body: string,
  contractName: string,
  filePath: string,
  startLineOffset: number,
): StateVariable[] {
  const vars: StateVariable[] = [];

  // Match state variable declarations (not inside functions).
  // Pattern: type ... name visibility? (= defaultValue)? ;
  const varRegex =
    /(?:(?:mapping\s*\([^)]+\))|(?:uint(?:8|16|32|64|128|256)?)|(?:int(?:8|16|32|64|128|256)?)|(?:bool)|(?:address)|(?:bytes(?:32)?)|(?:string)|(?:\w+(?:\[\])?))\s+(?:public\s+|private\s+|internal\s+|constant\s+|immutable\s+)*(\w+)\s*(?:=\s*[^;]+)?\s*;/g;

  // Strip function bodies using balanced brace matching (same approach as extractFunctions)
  const withoutFunctions = stripAllFunctionBodies(body);

  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(withoutFunctions)) !== null) {
    const name = m[1];
    // Skip keywords and modifier-like names
    if (
      ['public', 'private', 'internal', 'external', 'constant', 'immutable', 'view', 'pure', 'payable', 'memory', 'storage', 'calldata', 'indexed'].includes(name)
    ) {
      continue;
    }

    const category = classifyVariable(name);
    vars.push({
      name,
      type: m[0].replace(/\s*;.*$/, '').replace(name, '').trim(),
      category,
      contractName,
      filePath,
      line: startLineOffset + withoutFunctions.slice(0, m.index).split('\n').length,
    });
  }

  return vars;
}

/**
 * Strip all function bodies from source using balanced brace matching.
 * This handles nested braces correctly (unlike a simple non-greedy regex).
 */
function stripAllFunctionBodies(source: string): string {
  const funcRegex =
    /function\s+(\w+)\s*\(([^)]*)\)/g;
  let result = source;
  const removals: Array<{ start: number; end: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = funcRegex.exec(source)) !== null) {
    const sigEnd = m.index + m[0].length;
    const remaining = source.slice(sigEnd);

    // Find opening brace (skip modifiers/returns)
    const braceMatch = /[\s\S]*?\{/.exec(remaining);
    if (!braceMatch) continue;

    const bracePos = sigEnd + braceMatch[0].length - 1;

    // Find matching closing brace
    let depth = 1;
    let endPos = bracePos + 1;
    while (depth > 0 && endPos < source.length) {
      if (source[endPos] === '{') depth++;
      else if (source[endPos] === '}') depth--;
      endPos++;
    }

    removals.push({ start: m.index, end: endPos });
  }

  // Apply removals from end to start to preserve indices
  removals.sort((a, b) => b.start - a.start);
  for (const { start, end } of removals) {
    result = result.slice(0, start) + result.slice(end);
  }

  return result;
}

/**
 * Extract function definitions with their bodies from a contract body.
 */
function extractFunctions(
  body: string,
  contractName: string,
  filePath: string,
  startLineOffset: number,
): ContractFunction[] {
  const functions: ContractFunction[] = [];

  // Match function definitions — capture the full signature up to (but not including) the opening brace
  const funcRegex =
    /function\s+(\w+)\s*\(([^)]*)\)/g;

  let m: RegExpExecArray | null;
  while ((m = funcRegex.exec(body)) !== null) {
    const funcName = m[1];

    // Find the opening brace after the function signature
    const sigEnd = m.index + m[0].length;
    const remaining = body.slice(sigEnd);

    // Find opening brace while capturing the modifier text between ) and {
    const braceMatch = /([\s\S]*?)\{/.exec(remaining);
    if (!braceMatch) continue;

    const modifiersText = braceMatch[1].trim();
    const bracePos = sigEnd + braceMatch[0].length - 1;

    // Extract visibility from modifiers text
    const visMatch =
      /\b(public|external|internal|private)\b/.exec(modifiersText);
    const visibility = visMatch ? visMatch[1] : 'internal';

    const isReadOnly =
      /\bview\b/.test(modifiersText) || /\bpure\b/.test(modifiersText);

    // Find matching closing brace
    let depth = 1;
    let endPos = bracePos + 1;
    while (depth > 0 && endPos < body.length) {
      if (body[endPos] === '{') depth++;
      else if (body[endPos] === '}') depth--;
      endPos++;
    }

    const funcBody = body.slice(bracePos + 1, endPos - 1);
    const bodyLines = funcBody.split('\n').length;

    // Calculate the line number of this function
    const linesBefore = body.slice(0, m.index).split('\n').length;

    const transitions = extractTransitions(
      funcBody,
      funcName,
      contractName,
      filePath,
      startLineOffset + linesBefore,
    );

    functions.push({
      name: funcName,
      visibility,
      isReadOnly,
      modifiersText,
      body: funcBody,
      contractName,
      filePath,
      line: startLineOffset + linesBefore,
      bodyLineCount: bodyLines,
      transitions,
    });
  }

  return functions;
}

/**
 * Detect state-modifying operations within a function body.
 */
function extractTransitions(
  funcBody: string,
  functionName: string,
  contractName: string,
  filePath: string,
  baseLine: number,
): StateTransition[] {
  const transitions: StateTransition[] = [];

  // Track which lines we've already assigned transitions to (avoid double-counting
  // when a single line matches multiple patterns).
  const matchedLines = new Set<number>();

  const lines = funcBody.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const mapping of OPERATION_MAPPINGS) {
      if (!line.includes(mapping.signature)) continue;

      // Skip commented-out lines
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('/*')) continue;

      // Extract the amount expression from the operation arguments.
      // For patterns like `_mint(to, amount)` or `vault.lock(chain, token, amount, recipient)`,
      // we extract the relevant numeric argument.
      const amountExpression = extractAmountExpression(line, mapping.signature);

      const lineNum = baseLine + i + 1;
      matchedLines.add(lineNum);

      transitions.push({
        operation: mapping.kind,
        category: mapping.category,
        operationName: mapping.signature.replace(/^\./, ''),
        amountExpression,
        functionName,
        contractName,
        filePath,
        line: lineNum,
        context: trimmed,
      });
    }

    // Also detect compound assignment on state variables (e.g. `totalLocked += amount`)
    if (!matchedLines.has(baseLine + i + 1)) {
      const compAssignMatch = /(\w+)\s*(\+|-)=\s*([^;]+)/.exec(line);
      if (compAssignMatch) {
        const varName = compAssignMatch[1];
        const cat = classifyVariable(varName);
        if (cat !== 'unknown') {
          transitions.push({
            operation: compAssignMatch[2] === '+' ? 'add' : 'subtract',
            category: cat,
            operationName: compAssignMatch[2] === '+' ? 'addTo' : 'subtractFrom',
            amountExpression: compAssignMatch[3].trim(),
            functionName,
            contractName,
            filePath,
            line: baseLine + i + 1,
            context: line.trim(),
          });
        }
      }
    }
  }

  return transitions;
}

/**
 * Extract the relevant amount argument from an operation call.
 *
 * For known signatures we know which argument position represents the amount:
 *   _mint(to, amount)       → position 2
 *   _burn(account, amount)  → position 2
 *   vault.lock(chainId, token, amount, recipient) → position 3
 *   .burn(amount)           → position 1
 *   safeTransferFrom(from, to, amount) → position 3
 */
function extractAmountExpression(line: string, signature: string): string {
  // Find the call and its arguments
  const callRegex = new RegExp(
    signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(([^)]*)\\)',
  );
  const m = callRegex.exec(line);
  if (!m) return 'unknown';

  const args = m[1].split(',').map((s) => s.trim());

  // Determine which argument is the amount based on the signature
  const sigClean = signature.replace(/^\./, '');
  switch (sigClean) {
    case '_mint':
    case '_burn':
      return args[1] ?? 'unknown';
    case 'lock(':
    case 'safeTransferFrom':
      // For vault.lock(chainId, token, amount, ...) → index 2
      // For safeTransferFrom(from, to, amount) → index 2
      return args[2] ?? 'unknown';
    case 'burn':
    case '.mint':
      // .mint(to, amount) and .burn(amount) — multi-arity depends on context
      // For ERC20.mint(to, amount) → index 1, for ERC20.burn(amount) → index 0
      return args[1] ?? args[0] ?? 'unknown';
    case 'release(':
    case 'unlock(':
      return args[1] ?? args[0] ?? 'unknown';
    case 'deposit':
      // .deposit() wraps msg.value — no explicit amount argument
      return 'msg.value';
    default:
      // Best effort: return the last argument that looks numeric
      for (let i = args.length - 1; i >= 0; i--) {
        const arg = args[i];
        if (/\d+/.test(arg) || /amount|value|sum/i.test(arg)) {
          return arg;
        }
      }
      return args[args.length - 1] ?? 'unknown';
  }
}

/**
 * Parse a Solidity source file into a `ParsedContract` structure.
 */
export function parseSolidityFile(
  source: string,
  filePath: string,
): ParsedContract[] {
  const cleaned = stripComments(source);
  const contracts: ParsedContract[] = [];

  // Match contract declarations with their bodies using balanced braces
  const contractRegex =
    /(?:abstract\s+)?contract\s+(\w+)(?:\s+is\s+[^{]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = contractRegex.exec(cleaned)) !== null) {
    const contractName = m[1];
    const declLine = cleaned.slice(m.index, m.index + m[0].length);
    const inherits = extractInherits(declLine);

    // Find matching closing brace for the contract body
    const contractOpenPos = m.index + m[0].length - 1; // position of {
    let depth = 1;
    let contractClosePos = contractOpenPos + 1;
    while (depth > 0 && contractClosePos < cleaned.length) {
      if (cleaned[contractClosePos] === '{') depth++;
      else if (cleaned[contractClosePos] === '}') depth--;
      contractClosePos++;
    }

    const contractBody = cleaned.slice(contractOpenPos + 1, contractClosePos - 1);
    const startLineOffset = cleaned.slice(0, m.index).split('\n').length;

    const stateVariables = extractStateVariables(
      contractBody,
      contractName,
      filePath,
      startLineOffset,
    );

    const functions = extractFunctions(
      contractBody,
      contractName,
      filePath,
      startLineOffset,
    );

    const lineCount = cleaned.split('\n').length;

    contracts.push({
      name: contractName,
      filePath,
      stateVariables,
      functions,
      inherits,
      lineCount,
    });
  }

  return contracts;
}

/**
 * Parse multiple Solidity source files.
 */
export function parseSolidityFiles(
  sources: Array<{ path: string; content: string }>,
): ParsedContract[] {
  const allContracts: ParsedContract[] = [];
  for (const { path, content } of sources) {
    allContracts.push(...parseSolidityFile(content, path));
  }
  return allContracts;
}

export { OPERATION_MAPPINGS };
