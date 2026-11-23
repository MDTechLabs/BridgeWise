import { verifyDeploymentRecord } from './verify-deployed-bytecode';

describe('verify deployed bytecode/config', () => {
  it('passes when hashes match', () => {
    const r = verifyDeploymentRecord(
      { chainId: 1, address: '0xabc', expectedRuntimeBytecodeHash: '0x123', expectedConstructorArgsHash: '0x456', artifact: 'A.json' },
      { runtimeBytecodeHash: '0x123', constructorArgsHash: '0x456' },
    );
    expect(r.ok).toBe(true);
  });

  it('fails on bytecode mismatch', () => {
    const r = verifyDeploymentRecord(
      { chainId: 1, address: '0xabc', expectedRuntimeBytecodeHash: '0x123', artifact: 'A.json' },
      { runtimeBytecodeHash: '0xdead' },
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('runtime bytecode hash mismatch');
  });
});
