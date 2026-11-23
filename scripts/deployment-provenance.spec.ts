import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CompilerSettings,
  DeploymentProvenanceLedger,
  GENESIS_HASH,
  ProvenanceEntry,
  ProvenanceError,
  appendProvenanceToFile,
  loadProvenanceFile,
  resolveCleanGitCommit,
  runtimeCodeSha256,
  verifyDeployedProvenance,
  verifyProvenanceChain,
} from './deployment-provenance';

const admin = `0x${'a'.repeat(40)}`;
const attacker = `0x${'b'.repeat(40)}`;
const commit = 'c'.repeat(40);
const compiler: CompilerSettings = {
  solcVersion: '0.8.24',
  evmVersion: 'cancun',
  optimizer: { enabled: true, runs: 200 },
  viaIR: false,
  metadataBytecodeHash: 'ipfs',
};
const runtimeCode = '0x6080604052';
const codeHash = runtimeCodeSha256(runtimeCode);

function address(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

function input(n = 1, overrides: Record<string, unknown> = {}) {
  return {
    chainId: 1,
    contractName: 'BridgeCore',
    contractAddress: address(n),
    sourceCommit: commit,
    compiler,
    runtimeCodeSha256: codeHash,
    deployTxHash: `0x${'d'.repeat(64)}`,
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: ProvenanceError['code']): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProvenanceError);
    expect((error as ProvenanceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ProvenanceError ${code}`);
}

describe('deployment provenance ledger', () => {
  it('records a valid deployment and chains entries from genesis', () => {
    const ledger = new DeploymentProvenanceLedger([admin]);
    const first = ledger.append(admin, input(1));
    const second = ledger.append(admin, input(2));

    expect(first.index).toBe(0);
    expect(first.previousHash).toBe(GENESIS_HASH);
    expect(second.previousHash).toBe(first.entryHash);
    expect(ledger.headHash).toBe(second.entryHash);
    expect(first.record.recordedBy).toBe(admin);
    expect(() => verifyProvenanceChain(ledger.snapshot())).not.toThrow();
  });

  it('normalizes addresses and commit case', () => {
    const ledger = new DeploymentProvenanceLedger([admin.toUpperCase().replace('0X', '0x')]);
    const entry = ledger.append(
      admin,
      input(1, {
        contractAddress: `0x${'AB'.repeat(20)}`,
        sourceCommit: 'C'.repeat(40),
      }),
    );
    expect(entry.record.contractAddress).toBe(`0x${'ab'.repeat(20)}`);
    expect(entry.record.sourceCommit).toBe(commit);
  });

  it('requires at least one valid authorized recorder', () => {
    expectCode(() => new DeploymentProvenanceLedger([]), 'INVALID_INPUT');
    expectCode(() => new DeploymentProvenanceLedger(['nope']), 'INVALID_INPUT');
  });

  describe('invalid and boundary inputs', () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['zero chain id', { chainId: 0 }],
      ['fractional chain id', { chainId: 1.5 }],
      ['unsafe chain id', { chainId: Number.MAX_SAFE_INTEGER + 1 }],
      ['bad contract name', { contractName: '1bad name' }],
      ['overlong contract name', { contractName: 'A'.repeat(65) }],
      ['zero address', { contractAddress: `0x${'0'.repeat(40)}` }],
      ['short address', { contractAddress: '0x1234' }],
      ['short commit', { sourceCommit: 'abc123' }],
      ['non-hex commit', { sourceCommit: 'z'.repeat(40) }],
      ['branch name as commit', { sourceCommit: 'main' }],
      ['range compiler version', { compiler: { ...compiler, solcVersion: '^0.8.24' } }],
      ['missing optimizer', { compiler: { ...compiler, optimizer: undefined } }],
      ['negative runs', { compiler: { ...compiler, optimizer: { enabled: true, runs: -1 } } }],
      ['runs over uint32', { compiler: { ...compiler, optimizer: { enabled: true, runs: 2 ** 32 } } }],
      ['non-boolean viaIR', { compiler: { ...compiler, viaIR: 'yes' } }],
      ['unknown metadata hash', { compiler: { ...compiler, metadataBytecodeHash: 'sha1' } }],
      ['short code hash', { runtimeCodeSha256: 'abcd' }],
      ['short tx hash', { deployTxHash: '0x12' }],
      ['missing tx hash', { deployTxHash: undefined }],
    ];

    it.each(bad)('rejects %s without mutating state', (_name, overrides) => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      expect(() => ledger.append(admin, input(1, overrides))).toThrow(ProvenanceError);
      expect(ledger.length).toBe(0);
      expect(ledger.headHash).toBe(GENESIS_HASH);
    });

    it.each([null, undefined, 'str', 5, []])('rejects non-object input %p', (value) => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      expectCode(() => ledger.append(admin, value), 'INVALID_INPUT');
      expect(ledger.length).toBe(0);
    });

    it('accepts boundary values: 64-char commit, runs 0 and uint32 max, 64-char name', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      ledger.append(admin, input(1, { sourceCommit: 'e'.repeat(64) }));
      ledger.append(
        admin,
        input(2, { compiler: { ...compiler, optimizer: { enabled: false, runs: 0 } } }),
      );
      ledger.append(
        admin,
        input(3, {
          contractName: 'A'.repeat(64),
          compiler: { ...compiler, optimizer: { enabled: true, runs: 2 ** 32 - 1 } },
        }),
      );
      expect(ledger.length).toBe(3);
    });
  });

  describe('authorization', () => {
    it('rejects unauthorized and malformed recorders without mutation', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      const head = ledger.headHash;
      expectCode(() => ledger.append(attacker, input(1)), 'UNAUTHORIZED_RECORDER');
      expectCode(() => ledger.append('', input(1)), 'UNAUTHORIZED_RECORDER');
      expectCode(() => ledger.append(`0x${'0'.repeat(40)}`, input(1)), 'UNAUTHORIZED_RECORDER');
      expect(ledger.length).toBe(0);
      expect(ledger.headHash).toBe(head);
    });

    it('does not let a caller-supplied recordedBy override the authenticated recorder', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      const entry = ledger.append(admin, { ...input(1), recordedBy: attacker });
      expect(entry.record.recordedBy).toBe(admin);
    });
  });

  describe('duplicates and replays', () => {
    it('rejects a byte-identical replay', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      ledger.append(admin, input(1));
      const head = ledger.headHash;
      expectCode(() => ledger.append(admin, input(1)), 'DUPLICATE_RECORD');
      expect(ledger.headHash).toBe(head);
      expect(ledger.length).toBe(1);
    });

    it('rejects a conflicting rewrite of the same chain and address', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      const original = ledger.append(admin, input(1));
      expectCode(
        () => ledger.append(admin, input(1, { sourceCommit: 'f'.repeat(40) })),
        'DUPLICATE_RECORD',
      );
      expect(ledger.find(1, address(1))).toEqual(original);
    });

    it('allows the same address on a different chain', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      ledger.append(admin, input(1));
      ledger.append(admin, input(1, { chainId: 137 }));
      expect(ledger.length).toBe(2);
    });
  });

  describe('immutability and tamper detection', () => {
    it('returned entries and snapshots are copies', () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      const entry = ledger.append(admin, input(1));
      entry.record.sourceCommit = 'f'.repeat(40);
      const snap = ledger.snapshot();
      snap[0].record.contractName = 'Evil';
      snap.pop();
      expect(ledger.find(1, address(1))!.record.sourceCommit).toBe(commit);
      expect(ledger.find(1, address(1))!.record.contractName).toBe('BridgeCore');
      expect(ledger.length).toBe(1);
    });

    function build(): ProvenanceEntry[] {
      const ledger = new DeploymentProvenanceLedger([admin]);
      for (let i = 1; i <= 3; i++) ledger.append(admin, input(i));
      return ledger.snapshot();
    }

    it('detects edited, removed, reordered and duplicated entries on load', () => {
      const edited = build();
      edited[1].record.sourceCommit = 'f'.repeat(40);
      expectCode(() => new DeploymentProvenanceLedger([admin], edited), 'TAMPERED_LEDGER');

      const removedMiddle = build();
      removedMiddle.splice(1, 1);
      expectCode(() => verifyProvenanceChain(removedMiddle), 'TAMPERED_LEDGER');

      const reordered = build();
      [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
      expectCode(() => verifyProvenanceChain(reordered), 'TAMPERED_LEDGER');

      const duplicated = build();
      duplicated.push({ ...duplicated[0] });
      expectCode(() => verifyProvenanceChain(duplicated), 'TAMPERED_LEDGER');
    });

    it('detects a forged entry even when its own hash is recomputed incorrectly', () => {
      const entries = build();
      entries[2].entryHash = 'a'.repeat(64);
      expectCode(() => verifyProvenanceChain(entries), 'TAMPERED_LEDGER');
    });
  });

  describe('stateful invariants (seeded random sequences)', () => {
    function rng(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
      };
    }

    it.each([1, 2, 3, 4, 5, 6, 7, 8])('holds for seed %d', (seed) => {
      const rand = rng(seed);
      const ledger = new DeploymentProvenanceLedger([admin]);
      const accepted = new Map<string, string>();
      let previousSnapshot: ProvenanceEntry[] = [];

      for (let step = 0; step < 200; step++) {
        const n = 1 + Math.floor(rand() * 12);
        const chainId = 1 + Math.floor(rand() * 3);
        const key = `${chainId}:${address(n)}`;
        const caller = rand() < 0.3 ? attacker : admin;
        const payload = input(n, {
          chainId,
          sourceCommit: Math.floor(rand() * 16).toString(16).repeat(40),
        });
        const before = ledger.headHash;
        const lengthBefore = ledger.length;

        const shouldSucceed = caller === admin && !accepted.has(key);
        if (shouldSucceed) {
          const entry = ledger.append(caller, payload);
          accepted.set(key, entry.entryHash);
          expect(ledger.length).toBe(lengthBefore + 1);
        } else {
          expect(() => ledger.append(caller, payload)).toThrow(ProvenanceError);
          expect(ledger.headHash).toBe(before);
          expect(ledger.length).toBe(lengthBefore);
        }

        const snap = ledger.snapshot();
        // Append-only: every earlier entry is unchanged.
        previousSnapshot.forEach((entry, i) => expect(snap[i]).toEqual(entry));
        previousSnapshot = snap;
        // Chain integrity and key uniqueness.
        verifyProvenanceChain(snap);
        expect(snap.length).toBe(accepted.size);
        for (const [k, hash] of accepted) {
          const [c, a] = k.split(':');
          expect(ledger.find(Number(c), a)!.entryHash).toBe(hash);
        }
      }
    });

    it('serializes concurrent appends of the same record so exactly one wins', async () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      const results = await Promise.allSettled(
        Array.from({ length: 50 }, async () => ledger.append(admin, input(1))),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(ledger.length).toBe(1);
      verifyProvenanceChain(ledger.snapshot());
    });

    it('keeps a contiguous chain under concurrent appends of distinct records', async () => {
      const ledger = new DeploymentProvenanceLedger([admin]);
      await Promise.all(
        Array.from({ length: 50 }, async (_, i) => ledger.append(admin, input(i + 1))),
      );
      expect(ledger.length).toBe(50);
      verifyProvenanceChain(ledger.snapshot());
    });
  });
});

describe('file-backed provenance', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'provenance-'));
    file = join(dir, 'provenance.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appends without rewriting earlier lines and reloads cleanly', () => {
    appendProvenanceToFile(file, [admin], admin, input(1));
    const firstLine = readFileSync(file, 'utf8');
    appendProvenanceToFile(file, [admin], admin, input(2));
    const text = readFileSync(file, 'utf8');

    expect(text.startsWith(firstLine)).toBe(true);
    expect(loadProvenanceFile(file, [admin]).length).toBe(2);
  });

  it('does not touch the file for unauthorized, duplicate or invalid appends', () => {
    appendProvenanceToFile(file, [admin], admin, input(1));
    const before = readFileSync(file, 'utf8');

    expect(() => appendProvenanceToFile(file, [admin], attacker, input(2))).toThrow(ProvenanceError);
    expect(() => appendProvenanceToFile(file, [admin], admin, input(1))).toThrow(ProvenanceError);
    expect(() => appendProvenanceToFile(file, [admin], admin, input(3, { chainId: 0 }))).toThrow(
      ProvenanceError,
    );
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses to append to or load a tampered file', () => {
    appendProvenanceToFile(file, [admin], admin, input(1));
    appendProvenanceToFile(file, [admin], admin, input(2));
    const tampered = readFileSync(file, 'utf8').replace(commit, 'f'.repeat(40));
    writeFileSync(file, tampered);

    expectCode(() => loadProvenanceFile(file, [admin]), 'TAMPERED_LEDGER');
    expectCode(() => appendProvenanceToFile(file, [admin], admin, input(3)), 'TAMPERED_LEDGER');
    writeFileSync(file, 'not json\n');
    expectCode(() => loadProvenanceFile(file, [admin]), 'TAMPERED_LEDGER');
  });

  it('concurrent in-process appends of one record produce a single line', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, async () =>
        appendProvenanceToFile(file, [admin], admin, input(1)),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('verifyDeployedProvenance', () => {
  const expected = { sourceCommit: commit, compiler, runtimeCodeSha256: codeHash };
  const provider = { getCode: jest.fn().mockResolvedValue(runtimeCode) };

  function entry(overrides: Record<string, unknown> = {}): ProvenanceEntry {
    return new DeploymentProvenanceLedger([admin]).append(admin, input(1, overrides));
  }
  const failed = (r: { checks: Array<{ id: string; status: string }> }) =>
    r.checks.filter((c) => c.status === 'failed').map((c) => c.id);

  it('passes when record, reviewed build and chain agree', async () => {
    const report = await verifyDeployedProvenance(entry(), expected, provider);
    expect(report.passed).toBe(true);
  });

  it('fails when no record exists', async () => {
    const report = await verifyDeployedProvenance(undefined, expected, provider);
    expect(report.passed).toBe(false);
    expect(failed(report)).toEqual(['record-present']);
  });

  it('fails on commit, compiler and code-hash drift', async () => {
    const report = await verifyDeployedProvenance(
      entry(),
      {
        sourceCommit: 'f'.repeat(40),
        compiler: { ...compiler, optimizer: { enabled: true, runs: 1 } },
        runtimeCodeSha256: runtimeCodeSha256('0x00'),
      },
      provider,
    );
    expect(failed(report)).toEqual(
      expect.arrayContaining(['source-commit', 'compiler-settings', 'recorded-code-hash']),
    );
  });

  it('fails when on-chain code is different, empty, or malformed', async () => {
    for (const code of ['0x6080604053', '0x', 'garbage']) {
      const report = await verifyDeployedProvenance(entry(), expected, {
        getCode: jest.fn().mockResolvedValue(code),
      });
      expect(failed(report)).toContain('onchain-code-hash');
    }
  });

  it('fails closed when the RPC errors, without leaking the error text', async () => {
    const report = await verifyDeployedProvenance(entry(), expected, {
      getCode: jest.fn().mockRejectedValue(new Error('https://rpc.example/?key=secret')),
    });
    expect(failed(report)).toContain('onchain-code-hash');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('fails when the entry hash was tampered with', async () => {
    const e = entry();
    e.record.sourceCommit = 'f'.repeat(40);
    const report = await verifyDeployedProvenance(e, expected, provider);
    expect(failed(report)).toContain('entry-hash');
  });

  it('fails on invalid reviewed values instead of throwing', async () => {
    const report = await verifyDeployedProvenance(
      entry(),
      { ...expected, sourceCommit: 'main' },
      provider,
    );
    expect(report.passed).toBe(false);
  });
});

describe('resolveCleanGitCommit', () => {
  it('returns HEAD for a clean tree', () => {
    const git = jest.fn((args: string[]) => (args[0] === 'status' ? '' : `${commit}\n`));
    expect(resolveCleanGitCommit(git)).toBe(commit);
  });

  it('refuses a dirty tree', () => {
    const git = (args: string[]) => (args[0] === 'status' ? ' M a.sol\n' : commit);
    expectCode(() => resolveCleanGitCommit(git), 'DIRTY_WORKTREE');
  });

  it('refuses a malformed HEAD', () => {
    const git = (args: string[]) => (args[0] === 'status' ? '' : 'HEAD');
    expectCode(() => resolveCleanGitCommit(git), 'INVALID_COMMIT');
  });
});
