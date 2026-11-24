import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVED_MAINNET_ADDRESSES,
  GUARD_INVARIANTS,
  GUARD_PARAMETER_SET,
  MAINNET_CHAINS,
  DeploymentGuardError,
  evaluateDeploymentGuard,
  testManifest,
  validateDeploymentManifest,
} from './production-deployment-guard';

const SPEC_DOC = join(__dirname, '..', 'docs', 'PRODUCTION_DEPLOYMENT_GUARD.md');

function expectError(fn: () => unknown, code?: string): DeploymentGuardError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentGuardError);
    if (code) expect((error as DeploymentGuardError).code).toBe(code);
    return error as DeploymentGuardError;
  }
  throw new Error(`expected DeploymentGuardError ${code ?? ''}`);
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 0x1_0000_0000;
}

describe('production deployment guard specification (#1525)', () => {
  it('documents every invariant, chain and parameter set in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of GUARD_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    expect(doc).toContain(GUARD_PARAMETER_SET);
    for (const chainId of Object.keys(MAINNET_CHAINS)) expect(doc).toContain(`evm:${chainId}`);
  });

  it('passes a reviewed mainnet manifest', () => {
    const report = evaluateDeploymentGuard(testManifest());
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.status === 'passed')).toBe(true);
    expect(report.environment).toBe('production');
  });

  it('validates manifest boundaries before classifying anything', () => {
    const base = testManifest();
    expect(validateDeploymentManifest(base).chainId).toBe(1);
    expectError(() => validateDeploymentManifest({ ...base, schemaVersion: 2 }), 'unsupported-schema');
    expectError(() => validateDeploymentManifest({ ...base, parameterSetVersion: 'x' }), 'unsupported-parameter-set');
    expectError(() => validateDeploymentManifest({ ...base, releaseId: 'bad' }), 'invalid-release');
    expectError(() => validateDeploymentManifest({ ...base, environment: 'qa' }), 'invalid-environment');
    expectError(() => validateDeploymentManifest({ ...base, chainFamily: 'bitcoin' }), 'invalid-chain-family');
    expectError(() => validateDeploymentManifest({ ...base, chainId: 0 }), 'invalid-chain-id');
    expectError(() => validateDeploymentManifest({ ...base, sourceCommit: 'short' }), 'invalid-manifest');
    expectError(() => validateDeploymentManifest({ ...base, deployerAddress: '0x123' }), 'invalid-address');
    const burn = evaluateDeploymentGuard(testManifest({ deployerAddress: `0x${'0'.repeat(40)}` }));
    expect(burn.passed).toBe(false);
    expect(burn.checks.find((c) => c.id === 'addresses:not-testnet')?.status).toBe('failed');
  });

  it('rejects every known testnet chain id even when the label claims mainnet', () => {
    for (const chainId of [5, 11155111, 80001, 84532, 421614, 31337]) {
      const report = evaluateDeploymentGuard(
        testManifest({ chainId, networkLabel: 'ethereum-mainnet', bridgeAddress: `0x${'9'.repeat(40)}` }),
      );
      expect(report.passed).toBe(false);
      expect(report.checks.find((c) => c.id === 'chain-id:not-testnet')?.status).toBe('failed');
      expect(report.checks.find((c) => c.id === 'chain-id:mainnet-allowlist')?.status).toBe('failed');
    }
  });

  it('rejects unknown chains that are not in the mainnet allowlist', () => {
    const report = evaluateDeploymentGuard(testManifest({ chainId: 1337, networkLabel: 'ethereum-mainnet' }));
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'chain-id:mainnet-allowlist')?.status).toBe('failed');
  });

  it('rejects a mainnet chain with a testnet network label', () => {
    const report = evaluateDeploymentGuard(testManifest({ networkLabel: 'sepolia-testnet' }));
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'network-label')?.status).toBe('failed');
  });

  it('rejects wrong, duplicate and testnet-only addresses', () => {
    const wrong = evaluateDeploymentGuard(testManifest({ treasuryAddress: `0x${'9'.repeat(40)}` }));
    expect(wrong.passed).toBe(false);
    expect(wrong.checks.find((c) => c.id === 'addresses:inventory')?.status).toBe('failed');

    const dup = evaluateDeploymentGuard(testManifest({ adminAddress: `0x${'1'.repeat(40)}` }));
    expect(dup.passed).toBe(false);
    expect(dup.checks.find((c) => c.id === 'addresses:distinct')?.status).toBe('failed');

    const testnetOnly = evaluateDeploymentGuard(testManifest({ feeRecipient: `0x${'d'.repeat(39)}e` }));
    expect(testnetOnly.passed).toBe(false);
    expect(testnetOnly.checks.find((c) => c.id === 'addresses:not-testnet')?.status).toBe('failed');
  });

  it('rejects non-production environments', () => {
    for (const environment of ['staging', 'development'] as const) {
      const report = evaluateDeploymentGuard(testManifest({ environment }));
      expect(report.passed).toBe(false);
      expect(report.checks.find((c) => c.id === 'environment')?.status).toBe('failed');
    }
  });

  it('supports the reviewed Stellar public network and rejects test networks', () => {
    const addresses = {
      deployerAddress: `G${'A'.repeat(54)}B`,
      bridgeAddress: `G${'A'.repeat(54)}C`,
      treasuryAddress: `G${'A'.repeat(54)}D`,
      feeRecipient: `G${'A'.repeat(54)}E`,
      adminAddress: `G${'A'.repeat(54)}F`,
    };
    const stellar = { chainFamily: 'soroban', chainId: 'stellar', ...addresses };
    expect(evaluateDeploymentGuard(testManifest({ ...stellar, networkLabel: 'stellar-public' })).passed).toBe(true);
    const testnet = evaluateDeploymentGuard(
      testManifest({ ...stellar, networkLabel: 'stellar-testnet' }),
    );
    expect(testnet.passed).toBe(false);
    expect(testnet.checks.find((c) => c.id === 'chain-id:not-testnet')?.status).toBe('failed');
  });

  it('uses an explicit per-chain inventory with no inferred values', () => {
    for (const [chainId, inventory] of Object.entries(APPROVED_MAINNET_ADDRESSES)) {
      expect(Number(chainId)).toBeGreaterThan(0);
      expect(inventory.length).toBeGreaterThan(0);
      expect(new Set(inventory.map((a) => a.toLowerCase())).size).toBe(inventory.length);
      expect(MAINNET_CHAINS[Number(chainId)]).toMatch(/-mainnet$/);
    }
  });

  it('fails closed across randomized adversarial manifests without throwing', () => {
    const random = rng(1525);
    const chainIds = Object.keys(MAINNET_CHAINS).map(Number).concat([5, 97, 31337, 1337]);
    const labels = Object.values(MAINNET_CHAINS).concat(['sepolia', 'testnet', 'local']);
    for (let run = 0; run < 200; run++) {
      const chainId = chainIds[Math.floor(random() * chainIds.length)];
      const base = testManifest({
        chainId,
        networkLabel: labels[Math.floor(random() * labels.length)],
      });
      let mutated: unknown = { ...base };
      const choice = Math.floor(random() * 5);
      if (choice === 0) mutated = { ...base, environment: 'development' };
      if (choice === 1) mutated = { ...base, treasuryAddress: `0x${'0'.repeat(40)}` };
      if (choice === 2) mutated = { ...base, bridgeAddress: `0x${'9'.repeat(40)}` };
      if (choice === 3) mutated = { ...base, sourceCommit: 'abc' };
      if (choice === 4) mutated = null;
      try {
        const report = evaluateDeploymentGuard(mutated);
        expect(report.checks.length).toBeGreaterThan(0);
      } catch (error) {
        expect(error).toBeInstanceOf(DeploymentGuardError);
      }
    }
  });
});
