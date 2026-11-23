export type ChainDeployment = {
  chain: string;
  chainId: number | string;
  rpcEnv: string;
  expectedContracts: Record<string, string>;
  pinnedBlock: number | string;
};

export type ForkCheckResult = {
  chain: string;
  ok: boolean;
  missing: string[];
};

export function validateDeploymentMatrix(matrix: ChainDeployment[]): ForkCheckResult[] {
  return matrix.map((m) => {
    const missing: string[] = [];
    if (!m.chain) missing.push('chain');
    if (!m.rpcEnv) missing.push('rpcEnv');
    if (!m.pinnedBlock) missing.push('pinnedBlock');
    if (!m.expectedContracts || Object.keys(m.expectedContracts).length === 0) missing.push('expectedContracts');
    return { chain: m.chain || 'unknown', ok: missing.length === 0, missing };
  });
}
