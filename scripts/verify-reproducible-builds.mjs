#!/usr/bin/env node
/**
 * Reproducible-build gate for BridgeWise production contract packages.
 *
 * Zero dependencies and zero network access: the gate only reads the local
 * checkout, the reviewed policy file and local build output. It never asks an
 * RPC node, relayer, registry or CI service for any value it trusts.
 *
 * Commands
 *   policy            Static checks. Safe to run on every PR, needs no build.
 *   release           policy + lockfile, pinned hashes, and build-output checks.
 *   emit-manifest     Hash local build output into a manifest (for review).
 *   compare-manifests Require two independent builds to be byte-identical.
 *
 * Exit codes: 0 pass, 1 policy violation(s), 2 unusable input (fail closed).
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const POLICY_SCHEMA_VERSION = 1;
export const POLICY_FILE = 'release/reproducible-builds.policy.json';
export const POLICY_MARKER = 'solidityFromPolicy(';
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CRATES_INDEX = 'registry+https://github.com/rust-lang/crates.io-index';
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  'artifacts',
  'cache',
  'dist',
  'coverage',
]);

export class ReproError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReproError';
    this.code = code;
  }
}

const issue = (code, message) => ({ code, message });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- policy ---

function assertKeys(obj, required, where, optional = []) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ReproError('POLICY_INVALID', `${where} must be an object`);
  }
  for (const key of required) {
    if (!(key in obj)) {
      throw new ReproError('POLICY_INVALID', `${where}.${key} is required`);
    }
  }
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new ReproError('POLICY_INVALID', `${where}.${key} is not allowed`);
    }
  }
}

function assertSafeRelPath(value, where) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReproError('POLICY_INVALID', `${where} must be a non-empty path`);
  }
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes('*') ||
    value.startsWith('/') ||
    value.split('/').some((s) => s === '' || s === '.' || s === '..')
  ) {
    throw new ReproError(
      'POLICY_INVALID',
      `${where} must be a plain relative path without wildcards or traversal`,
    );
  }
  return value;
}

function assertReason(value, where) {
  if (typeof value !== 'string' || value.trim().length < 10) {
    throw new ReproError(
      'POLICY_INVALID',
      `${where} needs a reason of at least 10 characters`,
    );
  }
}

function assertSingleSegment(value, where) {
  assertSafeRelPath(value, where);
  if (value.includes('/')) {
    throw new ReproError('POLICY_INVALID', `${where} must be a single directory name`);
  }
}

/** Strict validation. Unknown keys, wrong types or bad hashes throw. */
export function validatePolicy(policy) {
  assertKeys(policy, ['schemaVersion', 'evm', 'soroban'], 'policy');
  if (policy.schemaVersion !== POLICY_SCHEMA_VERSION) {
    throw new ReproError(
      'POLICY_INVALID',
      `Unsupported policy schemaVersion ${String(policy.schemaVersion)}; expected ${POLICY_SCHEMA_VERSION}`,
    );
  }

  const evm = policy.evm;
  assertKeys(
    evm,
    [
      'sourcesDir',
      'compiler',
      'hardhatConfigs',
      'evidenceOnlyHardhatConfigs',
      'excludedSources',
      'artifacts',
    ],
    'policy.evm',
  );
  assertSafeRelPath(evm.sourcesDir, 'policy.evm.sourcesDir');
  const c = evm.compiler;
  assertKeys(
    c,
    ['solcVersion', 'evmVersion', 'optimizer', 'viaIR', 'metadataBytecodeHash'],
    'policy.evm.compiler',
  );
  if (!SEMVER_RE.test(c.solcVersion)) {
    throw new ReproError('POLICY_INVALID', 'solcVersion must be an exact x.y.z version');
  }
  if (typeof c.evmVersion !== 'string' || !/^[a-z]+$/.test(c.evmVersion)) {
    throw new ReproError('POLICY_INVALID', 'evmVersion must be a lowercase name');
  }
  assertKeys(c.optimizer, ['enabled', 'runs'], 'policy.evm.compiler.optimizer');
  if (
    typeof c.optimizer.enabled !== 'boolean' ||
    !Number.isInteger(c.optimizer.runs) ||
    c.optimizer.runs < 0 ||
    c.optimizer.runs > 2 ** 32 - 1
  ) {
    throw new ReproError('POLICY_INVALID', 'optimizer must be { enabled: bool, runs: uint32 }');
  }
  if (typeof c.viaIR !== 'boolean') {
    throw new ReproError('POLICY_INVALID', 'viaIR must be a boolean');
  }
  if (!['ipfs', 'bzzr1', 'none'].includes(c.metadataBytecodeHash)) {
    throw new ReproError('POLICY_INVALID', 'metadataBytecodeHash must be ipfs, bzzr1 or none');
  }
  if (!Array.isArray(evm.hardhatConfigs) || evm.hardhatConfigs.length === 0) {
    throw new ReproError('POLICY_INVALID', 'hardhatConfigs must list at least one config');
  }
  evm.hardhatConfigs.forEach((p, i) => assertSafeRelPath(p, `hardhatConfigs[${i}]`));
  for (const [list, name, key] of [
    [evm.evidenceOnlyHardhatConfigs, 'evidenceOnlyHardhatConfigs', 'path'],
    [evm.excludedSources, 'excludedSources', 'path'],
  ]) {
    if (!Array.isArray(list)) {
      throw new ReproError('POLICY_INVALID', `${name} must be an array`);
    }
    list.forEach((entry, i) => {
      assertKeys(entry, [key, 'reason'], `${name}[${i}]`);
      assertSafeRelPath(entry[key], `${name}[${i}].${key}`);
      assertReason(entry.reason, `${name}[${i}].reason`);
    });
  }
  if (evm.artifacts === null || typeof evm.artifacts !== 'object' || Array.isArray(evm.artifacts)) {
    throw new ReproError('POLICY_INVALID', 'evm.artifacts must be an object');
  }
  for (const [key, hash] of Object.entries(evm.artifacts)) {
    if (!/^[^:\s]+\.sol:[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) || !SHA256_RE.test(hash)) {
      throw new ReproError('POLICY_INVALID', `evm.artifacts["${key}"] must map "<path>.sol:<Name>" to a lowercase sha256`);
    }
  }

  const sr = policy.soroban;
  assertKeys(
    sr,
    ['workspaceRoot', 'rustToolchain', 'target', 'sorobanSdk', 'releaseProfile', 'packages', 'excluded'],
    'policy.soroban',
  );
  assertSafeRelPath(sr.workspaceRoot, 'policy.soroban.workspaceRoot');
  if (!SEMVER_RE.test(sr.rustToolchain)) {
    throw new ReproError('POLICY_INVALID', 'rustToolchain must be an exact x.y.z version, not a channel');
  }
  if (!['wasm32-unknown-unknown', 'wasm32v1-none'].includes(sr.target)) {
    throw new ReproError('POLICY_INVALID', 'target must be wasm32-unknown-unknown or wasm32v1-none');
  }
  if (!SEMVER_RE.test(sr.sorobanSdk)) {
    throw new ReproError('POLICY_INVALID', 'sorobanSdk must be an exact x.y.z version');
  }
  if (sr.releaseProfile === null || typeof sr.releaseProfile !== 'object' || Array.isArray(sr.releaseProfile) || Object.keys(sr.releaseProfile).length === 0) {
    throw new ReproError('POLICY_INVALID', 'releaseProfile must be a non-empty object');
  }
  if (!Array.isArray(sr.packages) || sr.packages.length === 0) {
    throw new ReproError('POLICY_INVALID', 'soroban.packages must list at least one package');
  }
  const ids = new Set();
  const dirs = new Set();
  const crates = new Set();
  sr.packages.forEach((p, i) => {
    assertKeys(p, ['id', 'dir', 'crateName', 'wasmSha256'], `soroban.packages[${i}]`);
    assertSingleSegment(p.dir, `soroban.packages[${i}].dir`);
    if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id)) {
      throw new ReproError('POLICY_INVALID', `soroban.packages[${i}].id must match [a-z0-9-]+`);
    }
    if (typeof p.crateName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(p.crateName)) {
      throw new ReproError('POLICY_INVALID', `soroban.packages[${i}].crateName is invalid`);
    }
    if (p.wasmSha256 !== null && !SHA256_RE.test(p.wasmSha256)) {
      throw new ReproError('POLICY_INVALID', `soroban.packages[${i}].wasmSha256 must be null or a lowercase sha256`);
    }
    for (const [set, v, what] of [[ids, p.id, 'id'], [dirs, p.dir, 'dir'], [crates, p.crateName, 'crateName']]) {
      if (set.has(v)) throw new ReproError('POLICY_INVALID', `duplicate package ${what} "${v}"`);
      set.add(v);
    }
  });
  if (!Array.isArray(sr.excluded)) {
    throw new ReproError('POLICY_INVALID', 'soroban.excluded must be an array');
  }
  sr.excluded.forEach((e, i) => {
    assertKeys(e, ['dir', 'reason'], `soroban.excluded[${i}]`);
    assertSingleSegment(e.dir, `soroban.excluded[${i}].dir`);
    assertReason(e.reason, `soroban.excluded[${i}].reason`);
    if (dirs.has(e.dir)) {
      throw new ReproError('POLICY_INVALID', `"${e.dir}" cannot be both a production package and excluded`);
    }
  });
  return policy;
}

export function loadPolicy(root, policyPath = POLICY_FILE) {
  const file = join(root, policyPath);
  if (!existsSync(file)) {
    throw new ReproError('POLICY_MISSING', `Policy file not found: ${policyPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new ReproError('POLICY_INVALID', `Policy file is not valid JSON: ${policyPath}`);
  }
  return validatePolicy(parsed);
}

// ------------------------------------------------------------ TOML subset --
// Minimal on purpose. Anything outside the subset throws, so an exotic
// manifest can never be silently misread by the gate.

function unsupported(msg) {
  return new ReproError('TOML_UNSUPPORTED', msg);
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function splitKey(raw) {
  const parts = [];
  const re = /\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(\.|$)/y;
  let pos = 0;
  while (pos < raw.length) {
    re.lastIndex = pos;
    const m = re.exec(raw);
    if (!m) throw unsupported(`Unsupported key syntax: ${raw}`);
    parts.push(m[1] ?? m[2] ?? m[3]);
    pos = re.lastIndex;
    if (m[4] === '') break;
  }
  if (parts.length === 0) throw unsupported(`Empty key: ${raw}`);
  return parts;
}

function ensurePath(root, parts) {
  let cur = root;
  for (const p of parts) {
    if (!(p in cur)) cur[p] = {};
    else if (cur[p] === null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      throw unsupported(`Key ${parts.join('.')} conflicts with a non-table value`);
    }
    cur = cur[p];
  }
  return cur;
}

function parseValue(s, pos) {
  const skip = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  skip();
  const ch = s[pos];
  if (ch === '"') {
    let out = '';
    pos++;
    while (pos < s.length && s[pos] !== '"') {
      if (s[pos] === '\\') {
        const n = s[pos + 1];
        const map = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
        if (!(n in map)) throw unsupported('Unsupported string escape');
        out += map[n];
        pos += 2;
      } else out += s[pos++];
    }
    if (s[pos] !== '"') throw unsupported('Unterminated string');
    return [out, pos + 1];
  }
  if (ch === "'") {
    const end = s.indexOf("'", pos + 1);
    if (end < 0) throw unsupported('Unterminated literal string');
    return [s.slice(pos + 1, end), end + 1];
  }
  if (ch === '[') {
    const arr = [];
    pos++;
    for (;;) {
      skip();
      if (s[pos] === ']') return [arr, pos + 1];
      let v;
      [v, pos] = parseValue(s, pos);
      arr.push(v);
      skip();
      if (s[pos] === ',') pos++;
      else if (s[pos] !== ']') throw unsupported('Malformed array');
    }
  }
  if (ch === '{') {
    const obj = {};
    pos++;
    for (;;) {
      skip();
      if (s[pos] === '}') return [obj, pos + 1];
      const m = /([A-Za-z0-9_.\-"']+)\s*=\s*/y;
      m.lastIndex = pos;
      const km = m.exec(s);
      if (!km) throw unsupported('Malformed inline table');
      const parts = splitKey(km[1]);
      let v;
      [v, pos] = parseValue(s, m.lastIndex);
      const target = ensurePath(obj, parts.slice(0, -1));
      const last = parts[parts.length - 1];
      if (last in target) throw unsupported(`Duplicate key ${last}`);
      target[last] = v;
      skip();
      if (s[pos] === ',') pos++;
      else if (s[pos] !== '}') throw unsupported('Malformed inline table');
    }
  }
  const rest = s.slice(pos);
  let m;
  if ((m = /^(true|false)\b/.exec(rest))) return [m[1] === 'true', pos + m[0].length];
  if ((m = /^-?\d[\d_]*(?![\d.eE:-])/.exec(rest))) {
    return [Number(m[0].replace(/_/g, '')), pos + m[0].length];
  }
  throw unsupported(`Unsupported value near: ${rest.slice(0, 20)}`);
}

function bracketsBalanced(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth <= 0;
}

export function parseToml(text) {
  const root = {};
  let cur = root;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = stripComment(lines[i]).trim();
    if (!line) continue;
    if (line.startsWith('[[')) throw unsupported('Array-of-tables is not supported');
    if (line.startsWith('[')) {
      const m = /^\[(.+)\]$/.exec(line);
      if (!m) throw unsupported(`Malformed table header: ${line}`);
      cur = ensurePath(root, splitKey(m[1]));
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) throw unsupported(`Expected key = value: ${line}`);
    const keyRaw = line.slice(0, eq).trim();
    let valueRaw = line.slice(eq + 1).trim();
    while (!bracketsBalanced(valueRaw)) {
      if (++i >= lines.length) throw unsupported('Unterminated multi-line value');
      valueRaw += ' ' + stripComment(lines[i]).trim();
    }
    if (valueRaw.startsWith('"""') || valueRaw.startsWith("'''")) {
      throw unsupported('Multi-line strings are not supported');
    }
    const parts = splitKey(keyRaw);
    const [value, end] = parseValue(valueRaw, 0);
    if (valueRaw.slice(end).trim() !== '') throw unsupported(`Trailing characters after value: ${line}`);
    const target = ensurePath(cur, parts.slice(0, -1));
    const last = parts[parts.length - 1];
    if (last in target) throw unsupported(`Duplicate key ${last}`);
    target[last] = value;
  }
  return root;
}

function readToml(file, label, issues) {
  if (!existsSync(file)) {
    issues.push(issue('MISSING_FILE', `${label} is missing`));
    return null;
  }
  try {
    return parseToml(readFileSync(file, 'utf8'));
  } catch (e) {
    issues.push(issue('TOML_UNSUPPORTED', `${label}: ${e.message}`));
    return null;
  }
}

// ------------------------------------------------------------ fs helpers ---

function walk(dir, visit, depth = 0, maxDepth = 12) {
  if (depth > maxDepth) {
    throw new ReproError('TREE_TOO_DEEP', `Directory tree under ${dir} is deeper than ${maxDepth}`);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ReproError('SYMLINK_FORBIDDEN', `Symlink found in build inputs: ${full}`);
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, visit, depth + 1, maxDepth);
    } else if (entry.isFile()) visit(full);
  }
}

const toPosix = (root, full) => full.slice(root.length + 1).split(/[\\/]/).join('/');

// ------------------------------------------------------------ EVM checks ---

export function checkEvmPolicy(root, policy) {
  const issues = [];
  const evm = policy.evm;
  const srcDir = join(root, evm.sourcesDir);
  if (!existsSync(srcDir)) {
    return [issue('MISSING_FILE', `sourcesDir ${evm.sourcesDir} does not exist`)];
  }

  // Default-in: every .sol file is production unless explicitly excluded.
  const solFiles = [];
  walk(srcDir, (f) => { if (f.endsWith('.sol')) solFiles.push(toPosix(root, f)); });
  const excluded = new Set(evm.excludedSources.map((e) => e.path));
  if (excluded.size !== evm.excludedSources.length) {
    issues.push(issue('POLICY_INVALID', 'excludedSources contains duplicates'));
  }
  for (const p of excluded) {
    if (!solFiles.includes(p)) {
      issues.push(issue('STALE_EXCLUSION', `excludedSources lists ${p}, which does not exist; remove it so the list cannot rot`));
    }
  }

  // Every Hardhat config must derive its compiler settings from the policy.
  const configRe = /^hardhat.*\.config\.(ts|js|cjs|mjs)$/;
  const found = [];
  const scan = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && depth < 3) scan(full, depth + 1);
      } else if (configRe.test(entry.name)) found.push(toPosix(root, full));
    }
  };
  scan(root, 0);
  const evidenceOnly = new Set(evm.evidenceOnlyHardhatConfigs.map((e) => e.path));
  const governed = new Set(evm.hardhatConfigs);
  for (const cfg of found) {
    if (!governed.has(cfg) && !evidenceOnly.has(cfg)) {
      issues.push(issue('UNCLASSIFIED_HARDHAT_CONFIG', `${cfg} is not listed in hardhatConfigs or evidenceOnlyHardhatConfigs`));
    }
  }
  for (const cfg of [...governed, ...evidenceOnly]) {
    if (!found.includes(cfg)) {
      issues.push(issue('STALE_ENTRY', `Hardhat config ${cfg} is listed in the policy but not found`));
    }
  }
  for (const cfg of governed) {
    if (!found.includes(cfg)) continue;
    const text = readFileSync(join(root, cfg), 'utf8');
    if (!text.includes(POLICY_MARKER)) {
      issues.push(issue('CONFIG_NOT_POLICY_DRIVEN', `${cfg} must set solidity from solidityFromPolicy() so it reads ${POLICY_FILE}`));
    }
  }
  return issues;
}

function evmKey(sourceName, contractName) {
  return `${sourceName}:${contractName}`;
}

/** Collect deployed-bytecode hashes from Hardhat-style artifact JSON. */
export function collectEvmArtifacts(root, policy, artifactsDir) {
  const base = join(artifactsDir, policy.evm.sourcesDir);
  if (!existsSync(base)) {
    throw new ReproError('BUILD_OUTPUT_MISSING', `No artifacts under ${base}; build first`);
  }
  const excluded = new Set(policy.evm.excludedSources.map((e) => e.path));
  const out = {};
  walk(base, (file) => {
    if (!file.endsWith('.json') || file.endsWith('.dbg.json')) return;
    let art;
    try {
      art = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new ReproError('ARTIFACT_UNREADABLE', `Artifact is not valid JSON: ${file}`);
    }
    if (typeof art?.sourceName !== 'string' || typeof art?.contractName !== 'string' || typeof art?.deployedBytecode !== 'string') {
      throw new ReproError('ARTIFACT_UNREADABLE', `Artifact lacks sourceName/contractName/deployedBytecode: ${file}`);
    }
    if (excluded.has(art.sourceName)) return;
    const hex = art.deployedBytecode.startsWith('0x') ? art.deployedBytecode.slice(2) : art.deployedBytecode;
    if (hex === '') return; // interface / abstract contract: nothing deployable
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      throw new ReproError('ARTIFACT_UNREADABLE', `deployedBytecode is not valid hex: ${file}`);
    }
    const key = evmKey(art.sourceName, art.contractName);
    if (key in out) throw new ReproError('ARTIFACT_UNREADABLE', `Duplicate artifact for ${key}`);
    out[key] = sha256(Buffer.from(hex, 'hex'));
  });
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** What the compiler actually ran with, from build-info, not from config text. */
export function checkBuildInfo(policy, buildInfoDir) {
  const issues = [];
  if (!existsSync(buildInfoDir)) {
    return [issue('BUILD_OUTPUT_MISSING', `build-info directory not found: ${buildInfoDir}`)];
  }
  const files = readdirSync(buildInfoDir).filter((f) => f.endsWith('.json') && !f.endsWith('.output.json'));
  if (files.length === 0) {
    return [issue('BUILD_INFO_UNREADABLE', 'No build-info input files found; cannot confirm compiler settings')];
  }
  const want = policy.evm.compiler;
  for (const f of files.sort()) {
    let info;
    try {
      info = JSON.parse(readFileSync(join(buildInfoDir, f), 'utf8'));
    } catch {
      issues.push(issue('BUILD_INFO_UNREADABLE', `${f} is not valid JSON`));
      continue;
    }
    const s = info?.input?.settings;
    if (!s || typeof info.solcLongVersion !== 'string') {
      issues.push(issue('BUILD_INFO_UNREADABLE', `${f} lacks input.settings or solcLongVersion`));
      continue;
    }
    const got = {
      solc: info.solcLongVersion,
      evmVersion: s.evmVersion,
      optimizerEnabled: s.optimizer?.enabled ?? false,
      runs: s.optimizer?.runs ?? 200,
      viaIR: s.viaIR ?? false,
      hash: s.metadata?.bytecodeHash ?? 'ipfs',
    };
    const bad = [];
    if (!got.solc.startsWith(`${want.solcVersion}+commit.`)) bad.push(`solc ${got.solc} != ${want.solcVersion}`);
    if (got.evmVersion !== want.evmVersion) bad.push(`evmVersion ${got.evmVersion} != ${want.evmVersion}`);
    if (got.optimizerEnabled !== want.optimizer.enabled) bad.push(`optimizer.enabled ${got.optimizerEnabled} != ${want.optimizer.enabled}`);
    if (want.optimizer.enabled && got.runs !== want.optimizer.runs) bad.push(`optimizer.runs ${got.runs} != ${want.optimizer.runs}`);
    if (got.viaIR !== want.viaIR) bad.push(`viaIR ${got.viaIR} != ${want.viaIR}`);
    if (got.hash !== want.metadataBytecodeHash) bad.push(`metadata.bytecodeHash ${got.hash} != ${want.metadataBytecodeHash}`);
    if (bad.length) issues.push(issue('COMPILER_SETTINGS_MISMATCH', `${f}: ${bad.join('; ')}`));
  }
  return issues;
}

export function checkEvmArtifacts(policy, built) {
  const issues = [];
  const pinned = policy.evm.artifacts;
  if (Object.keys(pinned).length === 0) {
    issues.push(issue('UNPINNED_EVM_ARTIFACTS', 'policy.evm.artifacts is empty: no reviewed hashes to verify against (run emit-manifest in a clean build and review the result)'));
  }
  for (const [key, hash] of Object.entries(built)) {
    if (!(key in pinned)) issues.push(issue('UNPINNED_ARTIFACT', `${key} was built but has no reviewed hash in the policy`));
    else if (pinned[key] !== hash) issues.push(issue('ARTIFACT_HASH_MISMATCH', `${key}: built ${hash}, reviewed ${pinned[key]}`));
  }
  for (const key of Object.keys(pinned)) {
    if (!(key in built)) issues.push(issue('MISSING_ARTIFACT', `${key} is pinned in the policy but was not produced by this build`));
  }
  return issues;
}

// -------------------------------------------------------- Soroban checks ---

function cargoMajorMinor(version) {
  const [major, minor] = version.split('.').map(Number);
  return { major, minor };
}

function checkDependencyTable(table, where, pkgDirs, issues, { production }) {
  for (const [name, spec] of Object.entries(table ?? {})) {
    const tbl = typeof spec === 'string' ? { version: spec } : spec;
    if (tbl === null || typeof tbl !== 'object') {
      issues.push(issue('UNPINNED_DEPENDENCY', `${where}: ${name} has an unsupported specification`));
      continue;
    }
    if ('git' in tbl || 'registry' in tbl || 'branch' in tbl || 'rev' in tbl) {
      issues.push(issue('GIT_DEPENDENCY', `${where}: ${name} uses git/registry overrides, which are not reproducible`));
      continue;
    }
    const features = Array.isArray(tbl.features) ? tbl.features : [];
    if (production && features.some((f) => String(f).includes('testutils'))) {
      issues.push(issue('TESTUTILS_IN_PROD', `${where}: ${name} enables testutils in a normal dependency`));
    }
    if ('path' in tbl) {
      const target = String(tbl.path).replace(/^\.\.\//, '');
      if (!String(tbl.path).startsWith('../') || !pkgDirs.has(target)) {
        issues.push(issue('PATH_DEPENDENCY', `${where}: ${name} path ${tbl.path} must point at a production package`));
      }
      continue;
    }
    if (tbl.workspace === true) continue;
    if (typeof tbl.version !== 'string' || !/^=\d+\.\d+\.\d+$/.test(tbl.version)) {
      issues.push(issue('UNPINNED_DEPENDENCY', `${where}: ${name} must use an exact "=x.y.z" version or { workspace = true }`));
    }
  }
}

export function checkSorobanPolicy(root, policy) {
  const issues = [];
  const sr = policy.soroban;
  const base = join(root, sr.workspaceRoot);
  if (!existsSync(base)) {
    return [issue('MISSING_FILE', `workspaceRoot ${sr.workspaceRoot} does not exist`)];
  }

  // Default-in classification of every directory under the workspace.
  const prodDirs = new Set(sr.packages.map((p) => p.dir));
  const exclDirs = new Set(sr.excluded.map((e) => e.dir));
  const present = new Set();
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      issues.push(issue('SYMLINK_FORBIDDEN', `Symlink in ${sr.workspaceRoot}: ${entry.name}`));
      continue;
    }
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    present.add(entry.name);
    if (!prodDirs.has(entry.name) && !exclDirs.has(entry.name)) {
      issues.push(issue('UNCLASSIFIED_PACKAGE', `${sr.workspaceRoot}/${entry.name} is neither a production package nor excluded with a reason`));
    }
  }
  for (const d of [...prodDirs, ...exclDirs]) {
    if (!present.has(d)) issues.push(issue('STALE_ENTRY', `${sr.workspaceRoot}/${d} is listed in the policy but does not exist`));
  }

  // Anything that can change what cargo builds, outside the reviewed files.
  let dir = base;
  for (;;) {
    for (const name of ['.cargo/config.toml', '.cargo/config']) {
      if (existsSync(join(dir, name))) {
        issues.push(issue('CARGO_CONFIG_PRESENT', `${toPosix(root, join(dir, name)) || name} can override targets, flags or sources; remove it or review it into the policy`));
      }
    }
    if (dir === root || dirname(dir) === dir) break;
    dir = dirname(dir);
  }

  // Toolchain pin.
  const tc = readToml(join(base, 'rust-toolchain.toml'), `${sr.workspaceRoot}/rust-toolchain.toml`, issues);
  if (tc) {
    const channel = tc.toolchain?.channel;
    if (channel !== sr.rustToolchain) {
      issues.push(issue('TOOLCHAIN_NOT_PINNED', `rust-toolchain.toml channel is ${JSON.stringify(channel)}; policy requires exactly "${sr.rustToolchain}"`));
    }
    const targets = tc.toolchain?.targets;
    if (!Array.isArray(targets) || !targets.includes(sr.target)) {
      issues.push(issue('TOOLCHAIN_TARGET_MISSING', `rust-toolchain.toml targets must include ${sr.target}`));
    }
  }
  const { minor } = cargoMajorMinor(sr.rustToolchain);
  if (sr.target === 'wasm32-unknown-unknown' && minor >= 82) {
    issues.push(issue('TOOLCHAIN_TARGET_INCOMPATIBLE', 'soroban-sdk 22 rejects wasm32-unknown-unknown on Rust 1.82+; use Rust <= 1.81 or wasm32v1-none on 1.84+'));
  }
  if (sr.target === 'wasm32v1-none' && minor < 84) {
    issues.push(issue('TOOLCHAIN_TARGET_INCOMPATIBLE', 'wasm32v1-none needs Rust 1.84+'));
  }

  // Workspace manifest: members, SDK pin and the one profile that counts.
  const ws = readToml(join(base, 'Cargo.toml'), `${sr.workspaceRoot}/Cargo.toml`, issues);
  if (ws) {
    const members = ws.workspace?.members;
    const want = [...prodDirs].sort();
    if (!Array.isArray(members) || JSON.stringify([...members].sort()) !== JSON.stringify(want)) {
      issues.push(issue('WORKSPACE_MEMBERS_MISMATCH', `workspace.members must be exactly [${want.join(', ')}]`));
    }
    if (ws.workspace?.resolver !== '2') {
      issues.push(issue('WORKSPACE_RESOLVER', 'workspace.resolver must be "2"'));
    }
    const sdk = ws.workspace?.dependencies?.['soroban-sdk'];
    const sdkVersion = typeof sdk === 'string' ? sdk : sdk?.version;
    if (sdkVersion !== `=${sr.sorobanSdk}`) {
      issues.push(issue('SDK_NOT_PINNED', `workspace.dependencies.soroban-sdk must be exactly "=${sr.sorobanSdk}"`));
    }
    const sdkFeatures = typeof sdk === 'object' && Array.isArray(sdk?.features) ? sdk.features : [];
    if (sdkFeatures.some((f) => String(f).includes('testutils'))) {
      issues.push(issue('TESTUTILS_IN_PROD', 'workspace soroban-sdk must not enable testutils'));
    }
    const prof = ws.profile?.release;
    if (!prof) {
      issues.push(issue('RELEASE_PROFILE_MISSING', 'workspace Cargo.toml needs [profile.release]; Cargo ignores profiles in member manifests'));
    } else if (JSON.stringify(sortKeys(prof)) !== JSON.stringify(sortKeys(sr.releaseProfile))) {
      issues.push(issue('RELEASE_PROFILE_MISMATCH', `[profile.release] must equal the policy releaseProfile exactly (got ${JSON.stringify(prof)})`));
    }
  }

  // Member manifests.
  for (const pkg of sr.packages) {
    const label = `${sr.workspaceRoot}/${pkg.dir}/Cargo.toml`;
    const m = readToml(join(base, pkg.dir, 'Cargo.toml'), label, issues);
    if (!m) continue;
    if (m.package?.name !== pkg.crateName) {
      issues.push(issue('CRATE_NAME_MISMATCH', `${label}: package.name is ${JSON.stringify(m.package?.name)}, policy expects ${pkg.crateName}`));
    }
    const crateType = m.lib?.['crate-type'];
    if (!Array.isArray(crateType) || !crateType.includes('cdylib')) {
      issues.push(issue('CRATE_TYPE', `${label}: lib.crate-type must include cdylib`));
    }
    if ('profile' in m) {
      issues.push(issue('PROFILE_IN_MEMBER', `${label}: profiles belong in the workspace root manifest; Cargo ignores them here`));
    }
    if (m.package?.build !== undefined || existsSync(join(base, pkg.dir, 'build.rs'))) {
      issues.push(issue('BUILD_SCRIPT_PRESENT', `${label}: build scripts run arbitrary code at build time and are not allowed in production packages`));
    }
    if (m['build-dependencies']) {
      issues.push(issue('BUILD_SCRIPT_PRESENT', `${label}: build-dependencies are not allowed in production packages`));
    }
    const deps = m.dependencies ?? {};
    const sdkDep = deps['soroban-sdk'];
    if (!sdkDep || sdkDep.workspace !== true) {
      issues.push(issue('SDK_NOT_PINNED', `${label}: [dependencies] soroban-sdk must be { workspace = true }`));
    }
    const defaults = m.features?.default;
    if (Array.isArray(defaults) && defaults.some((f) => String(f).includes('testutils'))) {
      issues.push(issue('TESTUTILS_IN_PROD', `${label}: default features enable testutils`));
    }
    const dirs = new Set(sr.packages.map((p) => p.dir));
    checkDependencyTable(deps, label, dirs, issues, { production: true });
    checkDependencyTable(m['dev-dependencies'], `${label} [dev-dependencies]`, dirs, issues, { production: false });
  }
  return issues;
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function parseCargoLock(text) {
  const packages = [];
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const pkg = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^(name|version|source|checksum)\s*=\s*"([^"]*)"\s*$/.exec(line.trim());
      if (m) pkg[m[1]] = m[2];
    }
    if (!pkg.name || !pkg.version) throw new ReproError('CARGO_LOCK_INVALID', 'Cargo.lock has a package without name/version');
    packages.push(pkg);
  }
  if (packages.length === 0) throw new ReproError('CARGO_LOCK_INVALID', 'Cargo.lock lists no packages');
  return packages;
}

export function checkCargoLock(root, policy) {
  const file = join(root, policy.soroban.workspaceRoot, 'Cargo.lock');
  if (!existsSync(file)) {
    return [issue('CARGO_LOCK_MISSING', `${policy.soroban.workspaceRoot}/Cargo.lock is not committed; builds would resolve dependencies at build time`)];
  }
  const issues = [];
  let packages;
  try {
    packages = parseCargoLock(readFileSync(file, 'utf8'));
  } catch (e) {
    return [issue(e.code ?? 'CARGO_LOCK_INVALID', e.message)];
  }
  const sdk = packages.filter((p) => p.name === 'soroban-sdk');
  if (sdk.length !== 1 || sdk[0].version !== policy.soroban.sorobanSdk) {
    issues.push(issue('SDK_LOCK_MISMATCH', `Cargo.lock must resolve exactly one soroban-sdk ${policy.soroban.sorobanSdk}`));
  }
  const local = new Set(policy.soroban.packages.map((p) => p.crateName));
  for (const p of packages) {
    if (!p.source) {
      if (!local.has(p.name)) issues.push(issue('CARGO_LOCK_UNKNOWN_LOCAL', `Cargo.lock has a local package "${p.name}" that is not in the policy`));
      continue;
    }
    if (p.source !== CRATES_INDEX) issues.push(issue('CARGO_LOCK_SOURCE', `${p.name} ${p.version} comes from ${p.source}; only crates.io is allowed`));
    else if (!p.checksum || !SHA256_RE.test(p.checksum)) issues.push(issue('CARGO_LOCK_CHECKSUM', `${p.name} ${p.version} has no checksum in Cargo.lock`));
  }
  return issues;
}

export function collectWasm(policy, wasmDir) {
  if (!existsSync(wasmDir)) {
    throw new ReproError('BUILD_OUTPUT_MISSING', `wasm output directory not found: ${wasmDir}`);
  }
  const out = {};
  const present = readdirSync(wasmDir).filter((f) => f.endsWith('.wasm'));
  for (const f of present) {
    const crate = f.slice(0, -5);
    out[crate] = sha256(readFileSync(join(wasmDir, f)));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function checkWasm(policy, built) {
  const issues = [];
  const known = new Map(policy.soroban.packages.map((p) => [p.crateName, p]));
  for (const pkg of policy.soroban.packages) {
    if (pkg.wasmSha256 === null) {
      issues.push(issue('UNPINNED_WASM', `${pkg.id}: no reviewed wasmSha256 in the policy`));
    }
    if (!(pkg.crateName in built)) {
      issues.push(issue('MISSING_WASM', `${pkg.id}: ${pkg.crateName}.wasm was not produced by this build`));
    } else if (pkg.wasmSha256 !== null && built[pkg.crateName] !== pkg.wasmSha256) {
      issues.push(issue('WASM_HASH_MISMATCH', `${pkg.id}: built ${built[pkg.crateName]}, reviewed ${pkg.wasmSha256}`));
    }
  }
  for (const crate of Object.keys(built)) {
    if (!known.has(crate)) issues.push(issue('UNEXPECTED_WASM', `${crate}.wasm is in the output but is not a production package`));
  }
  return issues;
}

// -------------------------------------------------------- orchestration ----

export function runPolicyStage(root, policy) {
  return [...checkEvmPolicy(root, policy), ...checkSorobanPolicy(root, policy)];
}

export function runReleaseStage(root, policy, paths) {
  const issues = runPolicyStage(root, policy);
  issues.push(...checkCargoLock(root, policy));
  issues.push(...checkBuildInfo(policy, paths.evmBuildInfo));
  issues.push(...checkEvmArtifacts(policy, collectEvmArtifacts(root, policy, paths.evmArtifacts)));
  issues.push(...checkWasm(policy, collectWasm(policy, paths.wasmDir)));
  return issues;
}

export function buildManifest(root, policy, paths) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    evm: collectEvmArtifacts(root, policy, paths.evmArtifacts),
    soroban: collectWasm(policy, paths.wasmDir),
  };
}

export function compareManifests(a, b) {
  const issues = [];
  for (const section of ['evm', 'soroban']) {
    const keys = new Set([...Object.keys(a[section] ?? {}), ...Object.keys(b[section] ?? {})]);
    for (const k of [...keys].sort()) {
      if (a[section]?.[k] !== b[section]?.[k]) {
        issues.push(issue('NON_REPRODUCIBLE', `${section}/${k}: ${a[section]?.[k] ?? 'absent'} vs ${b[section]?.[k] ?? 'absent'}`));
      }
    }
  }
  if (Object.keys(a.evm ?? {}).length + Object.keys(a.soroban ?? {}).length === 0) {
    issues.push(issue('EMPTY_MANIFEST', 'Both manifests are empty; nothing was compared'));
  }
  return issues;
}

// ------------------------------------------------------------------ CLI ----

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { positional: [] };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      if (key === 'json') opts.json = true;
      else {
        const v = rest[++i];
        if (v === undefined) throw new ReproError('USAGE', `--${key} needs a value`);
        opts[key] = v;
      }
    } else opts.positional.push(rest[i]);
  }
  return { command, opts };
}

function report(issues, json) {
  if (json) console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
  else if (issues.length === 0) console.log('reproducible-builds: OK');
  else {
    for (const i of issues) console.error(`FAIL [${i.code}] ${i.message}`);
    console.error(`reproducible-builds: ${issues.length} violation(s)`);
  }
}

export function main(argv) {
  const { command, opts } = parseArgs(argv);
  const root = resolve(opts.root ?? process.cwd());
  const paths = () => {
    for (const k of ['evm-artifacts', 'evm-build-info', 'wasm-dir']) {
      if (!opts[k]) throw new ReproError('USAGE', `--${k} is required`);
    }
    return {
      evmArtifacts: resolve(opts['evm-artifacts']),
      evmBuildInfo: resolve(opts['evm-build-info']),
      wasmDir: resolve(opts['wasm-dir']),
    };
  };
  if (command === 'compare-manifests') {
    if (opts.positional.length !== 2) throw new ReproError('USAGE', 'compare-manifests <a.json> <b.json>');
    const [a, b] = opts.positional.map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
    const issues = compareManifests(a, b);
    report(issues, opts.json);
    return issues.length ? 1 : 0;
  }
  const policy = loadPolicy(root, opts.policy);
  if (command === 'policy') {
    const issues = runPolicyStage(root, policy);
    report(issues, opts.json);
    return issues.length ? 1 : 0;
  }
  if (command === 'release') {
    const issues = runReleaseStage(root, policy, paths());
    report(issues, opts.json);
    return issues.length ? 1 : 0;
  }
  if (command === 'emit-manifest') {
    if (!opts.out) throw new ReproError('USAGE', '--out is required');
    const manifest = buildManifest(root, policy, paths());
    writeFileSync(resolve(opts.out), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`wrote ${opts.out}`);
    return 0;
  }
  throw new ReproError('USAGE', 'Usage: verify-reproducible-builds <policy|release|emit-manifest|compare-manifests> [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`FAIL [${e.code ?? 'UNEXPECTED'}] ${e.message}`);
    process.exitCode = 2;
  }
}
