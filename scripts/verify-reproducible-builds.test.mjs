import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ReproError,
  buildManifest,
  checkBuildInfo,
  checkCargoLock,
  checkEvmArtifacts,
  checkEvmPolicy,
  checkSorobanPolicy,
  checkWasm,
  collectEvmArtifacts,
  collectWasm,
  compareManifests,
  parseToml,
  runReleaseStage,
  validatePolicy,
} from './verify-reproducible-builds.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const codes = (issues) => issues.map((i) => i.code);

function basePolicy() {
  return {
    schemaVersion: 1,
    evm: {
      sourcesDir: 'contracts',
      compiler: {
        solcVersion: '0.8.24',
        evmVersion: 'cancun',
        optimizer: { enabled: false, runs: 200 },
        viaIR: false,
        metadataBytecodeHash: 'ipfs',
      },
      hardhatConfigs: ['hardhat.config.ts'],
      evidenceOnlyHardhatConfigs: [],
      excludedSources: [
        { path: 'contracts/test/Mock.sol', reason: 'Test-only helper, never deployed.' },
      ],
      artifacts: {},
    },
    soroban: {
      workspaceRoot: 'contracts/soroban',
      rustToolchain: '1.81.0',
      target: 'wasm32-unknown-unknown',
      sorobanSdk: '22.0.7',
      releaseProfile: { 'opt-level': 'z', lto: true, panic: 'abort' },
      packages: [{ id: 'vault', dir: 'vault', crateName: 'soroban_vault', wasmSha256: null }],
      excluded: [{ dir: 'legacy', reason: 'Unbuildable legacy crate, not shipped.' }],
    },
  };
}

function put(root, rel, body) {
  const f = join(root, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, body);
}

function goodRepo() {
  const root = mkdtempSync(join(tmpdir(), 'repro-'));
  put(root, 'contracts/Bridge.sol', 'contract Bridge {}');
  put(root, 'contracts/test/Mock.sol', 'contract Mock {}');
  put(root, 'hardhat.config.ts', 'export default { solidity: solidityFromPolicy() };');
  put(root, 'contracts/soroban/rust-toolchain.toml', '[toolchain]\nchannel = "1.81.0"\ntargets = ["wasm32-unknown-unknown"]\n');
  put(
    root,
    'contracts/soroban/Cargo.toml',
    `[workspace]
resolver = "2"
members = [
  "vault",
]

[workspace.dependencies]
soroban-sdk = "=22.0.7"

[profile.release]
opt-level = "z"
lto = true
panic = "abort"
`,
  );
  put(
    root,
    'contracts/soroban/vault/Cargo.toml',
    `[package]
name = "soroban_vault"
version = "0.1.0"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
`,
  );
  put(root, 'contracts/soroban/legacy/readme.txt', 'x');
  return root;
}

const withRepo = (fn) => {
  const root = goodRepo();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------- policy ---

test('accepts a well-formed policy', () => {
  assert.doesNotThrow(() => validatePolicy(basePolicy()));
});

test('rejects unknown keys, floating versions, bad hashes and vague reasons', () => {
  const mutate = (fn) => {
    const p = basePolicy();
    fn(p);
    return p;
  };
  assert.throws(() => validatePolicy(mutate((p) => { p.extra = 1; })), /not allowed/);
  assert.throws(() => validatePolicy(mutate((p) => { p.evm.compiler.solcVersion = '^0.8.24'; })), /exact/);
  assert.throws(() => validatePolicy(mutate((p) => { p.soroban.rustToolchain = 'stable'; })), /exact/);
  assert.throws(() => validatePolicy(mutate((p) => { p.soroban.packages[0].wasmSha256 = 'ABC'; })), /sha256/);
  assert.throws(() => validatePolicy(mutate((p) => { p.evm.artifacts['x.sol:X'] = 'nothex'; })), /sha256/);
  assert.throws(() => validatePolicy(mutate((p) => { p.evm.excludedSources[0].reason = 'skip'; })), /reason/);
  assert.throws(() => validatePolicy(mutate((p) => { p.evm.excludedSources[0].path = 'contracts/test/*.sol'; })), /wildcards/);
  assert.throws(() => validatePolicy(mutate((p) => { p.evm.excludedSources[0].path = '../evil.sol'; })), /traversal|relative/);
  assert.throws(() => validatePolicy(mutate((p) => { p.soroban.excluded[0].dir = 'vault'; })), /both/);
  assert.throws(() => validatePolicy(mutate((p) => { p.schemaVersion = 2; })), /schemaVersion/);
});

// ------------------------------------------------------------------ TOML ---

test('parses the TOML subset used by Cargo manifests', () => {
  const t = parseToml(`
[a]
x = 1_000 # comment
y = "str # not a comment"
z = { workspace = true, features = ["testutils"] }
list = [
  "one",
  "two", # trailing
]
[a.b]
c.d = false
`);
  assert.equal(t.a.x, 1000);
  assert.equal(t.a.y, 'str # not a comment');
  assert.deepEqual(t.a.z, { workspace: true, features: ['testutils'] });
  assert.deepEqual(t.a.list, ['one', 'two']);
  assert.equal(t.a.b.c.d, false);
});

test('fails closed on TOML it does not understand or on duplicate keys', () => {
  assert.throws(() => parseToml('[[bin]]\nname = "x"'), ReproError);
  assert.throws(() => parseToml('a = """multi"""'), ReproError);
  assert.throws(() => parseToml('a = 1\na = 2'), ReproError);
  assert.throws(() => parseToml('a = 1979-05-27'), ReproError);
});

// ------------------------------------------------------------- EVM policy --

test('EVM: accepts a clean tree; new contracts default into scope', () =>
  withRepo((root) => {
    const policy = basePolicy();
    assert.deepEqual(checkEvmPolicy(root, policy), []);
    put(root, 'contracts/New.sol', 'contract New {}');
    assert.deepEqual(checkEvmPolicy(root, policy), []);
    const built = { 'contracts/Bridge.sol:Bridge': sha('a'), 'contracts/New.sol:New': sha('b') };
    policy.evm.artifacts = { 'contracts/Bridge.sol:Bridge': sha('a') };
    assert.deepEqual(codes(checkEvmArtifacts(policy, built)), ['UNPINNED_ARTIFACT']);
  }));

test('EVM: stale exclusions, unclassified or non-policy-driven configs fail', () =>
  withRepo((root) => {
    const policy = basePolicy();
    policy.evm.excludedSources.push({ path: 'contracts/test/Gone.sol', reason: 'Was removed long ago.' });
    put(root, 'hardhat.prod.config.ts', 'export default {};');
    put(root, 'hardhat.config.ts', 'export default { solidity: { version: "0.8.24" } };');
    const c = codes(checkEvmPolicy(root, policy));
    assert.ok(c.includes('STALE_EXCLUSION'));
    assert.ok(c.includes('UNCLASSIFIED_HARDHAT_CONFIG'));
    assert.ok(c.includes('CONFIG_NOT_POLICY_DRIVEN'));
  }));

test('EVM: symlinks in the sources tree are rejected', () =>
  withRepo((root) => {
    symlinkSync('/etc/passwd', join(root, 'contracts/link.sol'));
    assert.throws(() => checkEvmPolicy(root, basePolicy()), (e) => e.code === 'SYMLINK_FORBIDDEN');
  }));

// ----------------------------------------------------------- EVM artifacts --

function writeArtifact(root, sourceName, contractName, deployedBytecode) {
  put(
    join(root, 'artifacts'),
    `${sourceName}/${contractName}.json`,
    JSON.stringify({ sourceName, contractName, deployedBytecode }),
  );
}

test('EVM: artifact hashing skips excluded and abstract contracts', () =>
  withRepo((root) => {
    writeArtifact(root, 'contracts/Bridge.sol', 'Bridge', '0x6001600055');
    writeArtifact(root, 'contracts/IBridge.sol', 'IBridge', '0x');
    writeArtifact(root, 'contracts/test/Mock.sol', 'Mock', '0x60ff');
    const built = collectEvmArtifacts(root, basePolicy(), join(root, 'artifacts'));
    assert.deepEqual(Object.keys(built), ['contracts/Bridge.sol:Bridge']);
    assert.equal(built['contracts/Bridge.sol:Bridge'], sha(Buffer.from('6001600055', 'hex')));
  }));

test('EVM: mismatch, missing and unpinned artifacts all fail; empty pin set fails', () => {
  const policy = basePolicy();
  assert.deepEqual(codes(checkEvmArtifacts(policy, { 'a.sol:A': sha('1') })), ['UNPINNED_EVM_ARTIFACTS', 'UNPINNED_ARTIFACT']);
  policy.evm.artifacts = { 'a.sol:A': sha('1'), 'b.sol:B': sha('2') };
  assert.deepEqual(codes(checkEvmArtifacts(policy, { 'a.sol:A': sha('X') })), ['ARTIFACT_HASH_MISMATCH', 'MISSING_ARTIFACT']);
  assert.deepEqual(checkEvmArtifacts(policy, { 'a.sol:A': sha('1'), 'b.sol:B': sha('2') }), []);
});

test('EVM: malformed artifacts fail closed instead of being skipped', () =>
  withRepo((root) => {
    put(join(root, 'artifacts'), 'contracts/Bad.sol/Bad.json', '{not json');
    assert.throws(() => collectEvmArtifacts(root, basePolicy(), join(root, 'artifacts')), (e) => e.code === 'ARTIFACT_UNREADABLE');
  }));

test('EVM: build-info must show the pinned compiler settings', () =>
  withRepo((root) => {
    const dir = join(root, 'bi');
    const info = (over = {}) => JSON.stringify({
      solcLongVersion: '0.8.24+commit.e11b9ed9',
      input: { settings: { evmVersion: 'cancun', optimizer: { enabled: false, runs: 200 }, ...over } },
    });
    put(dir, 'ok.json', info());
    assert.deepEqual(checkBuildInfo(basePolicy(), dir), []);
    put(dir, 'bad.json', info({ evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 }, viaIR: true }));
    const [issueItem] = checkBuildInfo(basePolicy(), dir);
    assert.equal(issueItem.code, 'COMPILER_SETTINGS_MISMATCH');
    assert.match(issueItem.message, /evmVersion/);
    assert.match(issueItem.message, /optimizer\.enabled/);
    assert.match(issueItem.message, /viaIR/);
    assert.deepEqual(codes(checkBuildInfo(basePolicy(), join(root, 'nope'))), ['BUILD_OUTPUT_MISSING']);
  }));

test('EVM: wrong solc patch version fails', () =>
  withRepo((root) => {
    const dir = join(root, 'bi');
    put(dir, 'a.json', JSON.stringify({ solcLongVersion: '0.8.25+commit.b61c2a91', input: { settings: { evmVersion: 'cancun' } } }));
    assert.match(checkBuildInfo(basePolicy(), dir)[0].message, /solc/);
  }));

// --------------------------------------------------------------- Soroban ----

test('Soroban: a correct workspace passes', () =>
  withRepo((root) => assert.deepEqual(checkSorobanPolicy(root, basePolicy()), [])));

test('Soroban: unclassified directories and stale entries fail', () =>
  withRepo((root) => {
    mkdirSync(join(root, 'contracts/soroban/shiny'));
    const policy = basePolicy();
    policy.soroban.excluded.push({ dir: 'ghost', reason: 'No longer exists here.' });
    const c = codes(checkSorobanPolicy(root, policy));
    assert.ok(c.includes('UNCLASSIFIED_PACKAGE'));
    assert.ok(c.includes('STALE_ENTRY'));
  }));

test('Soroban: floating toolchain, wrong target and SDK-rule violations fail', () =>
  withRepo((root) => {
    put(root, 'contracts/soroban/rust-toolchain.toml', '[toolchain]\nchannel = "stable"\n');
    const c = codes(checkSorobanPolicy(root, basePolicy()));
    assert.ok(c.includes('TOOLCHAIN_NOT_PINNED'));
    assert.ok(c.includes('TOOLCHAIN_TARGET_MISSING'));
    const p = basePolicy();
    p.soroban.rustToolchain = '1.84.0';
    assert.ok(codes(checkSorobanPolicy(root, p)).includes('TOOLCHAIN_TARGET_INCOMPATIBLE'));
  }));

test('Soroban: release profile in a member, drift in the root, or testutils in prod fail', () =>
  withRepo((root) => {
    put(root, 'contracts/soroban/vault/Cargo.toml', `[package]
name = "soroban_vault"
[lib]
crate-type = ["cdylib"]
[dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
rand = "0.8"
[profile.release]
opt-level = 3
`);
    put(root, 'contracts/soroban/Cargo.toml', `[workspace]
resolver = "2"
members = ["vault", "extra"]
[workspace.dependencies]
soroban-sdk = "22.0.7"
[profile.release]
opt-level = 3
`);
    const c = codes(checkSorobanPolicy(root, basePolicy()));
    for (const expected of ['PROFILE_IN_MEMBER', 'TESTUTILS_IN_PROD', 'UNPINNED_DEPENDENCY', 'WORKSPACE_MEMBERS_MISMATCH', 'SDK_NOT_PINNED', 'RELEASE_PROFILE_MISMATCH']) {
      assert.ok(c.includes(expected), `expected ${expected}, got ${c.join(',')}`);
    }
  }));

test('Soroban: build scripts, git dependencies and cargo config overrides fail', () =>
  withRepo((root) => {
    put(root, 'contracts/soroban/vault/build.rs', 'fn main() {}');
    put(root, 'contracts/soroban/.cargo/config.toml', '[build]\nrustflags = ["-Cevil"]\n');
    put(root, 'contracts/soroban/vault/Cargo.toml', `[package]
name = "soroban_vault"
[lib]
crate-type = ["cdylib"]
[dependencies]
soroban-sdk = { workspace = true }
sneaky = { git = "https://example.invalid/x" }
`);
    const c = codes(checkSorobanPolicy(root, basePolicy()));
    assert.ok(c.includes('BUILD_SCRIPT_PRESENT'));
    assert.ok(c.includes('CARGO_CONFIG_PRESENT'));
    assert.ok(c.includes('GIT_DEPENDENCY'));
  }));

test('Soroban: Cargo.lock must exist, pin the SDK, and come only from crates.io with checksums', () =>
  withRepo((root) => {
    const policy = basePolicy();
    assert.deepEqual(codes(checkCargoLock(root, policy)), ['CARGO_LOCK_MISSING']);
    const idx = 'registry+https://github.com/rust-lang/crates.io-index';
    const good = `version = 3

[[package]]
name = "soroban-sdk"
version = "22.0.7"
source = "${idx}"
checksum = "${'a'.repeat(64)}"

[[package]]
name = "soroban_vault"
version = "0.1.0"
`;
    put(root, 'contracts/soroban/Cargo.lock', good);
    assert.deepEqual(checkCargoLock(root, policy), []);
    put(root, 'contracts/soroban/Cargo.lock', good.replace('22.0.7', '22.0.8') + `
[[package]]
name = "evil"
version = "1.0.0"
source = "git+https://example.invalid/evil#abcdef"

[[package]]
name = "nosum"
version = "1.0.0"
source = "${idx}"

[[package]]
name = "stranger"
version = "1.0.0"
`);
    const c = codes(checkCargoLock(root, policy));
    for (const expected of ['SDK_LOCK_MISMATCH', 'CARGO_LOCK_SOURCE', 'CARGO_LOCK_CHECKSUM', 'CARGO_LOCK_UNKNOWN_LOCAL']) {
      assert.ok(c.includes(expected), `expected ${expected}, got ${c.join(',')}`);
    }
  }));

test('Soroban: wasm hashes must match, be pinned, and contain no unexpected crates', () =>
  withRepo((root) => {
    const dir = join(root, 'wasm');
    put(dir, 'soroban_vault.wasm', 'wasm-bytes');
    const built = collectWasm(basePolicy(), dir);
    assert.equal(built.soroban_vault, sha('wasm-bytes'));
    const policy = basePolicy();
    assert.deepEqual(codes(checkWasm(policy, built)), ['UNPINNED_WASM']);
    policy.soroban.packages[0].wasmSha256 = sha('wasm-bytes');
    assert.deepEqual(checkWasm(policy, built), []);
    policy.soroban.packages[0].wasmSha256 = sha('other');
    assert.deepEqual(codes(checkWasm(policy, built)), ['WASM_HASH_MISMATCH']);
    assert.deepEqual(codes(checkWasm(policy, { ...built, bls_verifier: sha('x') })), ['WASM_HASH_MISMATCH', 'UNEXPECTED_WASM']);
    assert.deepEqual(codes(checkWasm(policy, {})), ['MISSING_WASM']);
  }));

// ----------------------------------------------- end to end and manifests ---

test('release stage passes only when everything is pinned and matches', () =>
  withRepo((root) => {
    const policy = basePolicy();
    writeArtifact(root, 'contracts/Bridge.sol', 'Bridge', '0x6001');
    put(join(root, 'bi'), 'a.json', JSON.stringify({ solcLongVersion: '0.8.24+commit.e11b9ed9', input: { settings: { evmVersion: 'cancun' } } }));
    put(join(root, 'wasm'), 'soroban_vault.wasm', 'w');
    put(root, 'contracts/soroban/Cargo.lock', `[[package]]
name = "soroban-sdk"
version = "22.0.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "${'b'.repeat(64)}"
`);
    const paths = { evmArtifacts: join(root, 'artifacts'), evmBuildInfo: join(root, 'bi'), wasmDir: join(root, 'wasm') };

    // unpinned policy: must fail closed
    assert.ok(runReleaseStage(root, policy, paths).length > 0);

    // pin what the build produced (this is what a reviewed policy PR does)
    const manifest = buildManifest(root, policy, paths);
    policy.evm.artifacts = manifest.evm;
    policy.soroban.packages[0].wasmSha256 = manifest.soroban.soroban_vault;
    assert.deepEqual(runReleaseStage(root, policy, paths), []);

    // a one-byte change to the contract is caught
    writeArtifact(root, 'contracts/Bridge.sol', 'Bridge', '0x6002');
    assert.deepEqual(codes(runReleaseStage(root, policy, paths)), ['ARTIFACT_HASH_MISMATCH']);
  }));

test('compare-manifests: identical builds pass, any divergence or empty input fails', () => {
  const a = { evm: { 'a.sol:A': sha('1') }, soroban: { v: sha('2') } };
  assert.deepEqual(compareManifests(a, structuredClone(a)), []);
  const b = { evm: { 'a.sol:A': sha('1') }, soroban: { v: sha('3') } };
  assert.deepEqual(codes(compareManifests(a, b)), ['NON_REPRODUCIBLE']);
  assert.deepEqual(codes(compareManifests({ evm: {}, soroban: {} }, { evm: {}, soroban: {} })), ['EMPTY_MANIFEST']);
  assert.deepEqual(codes(compareManifests(a, { evm: {}, soroban: {} })), ['NON_REPRODUCIBLE', 'NON_REPRODUCIBLE']);
});
