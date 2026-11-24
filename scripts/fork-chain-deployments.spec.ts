import { validateDeploymentMatrix } from './fork-chain-deployments';

describe('fork deployment matrix', () => {
  it('accepts complete chain entries', () => {
    const res = validateDeploymentMatrix([
      { chain: 'Ethereum', chainId: 1, rpcEnv: 'ETH_RPC_URL', expectedContracts: { bridge: '0xabc' }, pinnedBlock: 123 },
    ]);
    expect(res[0].ok).toBe(true);
  });

  it('flags missing required fields', () => {
    const res = validateDeploymentMatrix([
      { chain: '', chainId: 1, rpcEnv: '', expectedContracts: {}, pinnedBlock: '' },
    ]);
    expect(res[0].ok).toBe(false);
    expect(res[0].missing).toContain('expectedContracts');
  });
});
