/**
 * Deployment verification stub: compare deployed runtime bytecode and constructor args
 * against reproducible build artifacts.
 *
 * Security: never use production private keys. Reads only public RPC data.
 */
export type DeploymentExpectation = {
  chainId: number;
  address: string;
  expectedRuntimeBytecodeHash: string; // keccak256 of runtime bytecode
  expectedConstructorArgsHash?: string;
  artifact: string;
};

export type VerificationResult = {
  address: string;
  chainId: number;
  ok: boolean;
  checks: Record<string, boolean>;
  errors: string[];
};

export function verifyDeploymentRecord(expected: DeploymentExpectation, actual: { runtimeBytecodeHash: string; constructorArgsHash?: string }): VerificationResult {
  const errors: string[] = [];
  const checks = {
    runtimeBytecode: expected.expectedRuntimeBytecodeHash.toLowerCase() === actual.runtimeBytecodeHash.toLowerCase(),
    constructorArgs: !expected.expectedConstructorArgsHash || expected.expectedConstructorArgsHash.toLowerCase() === (actual.constructorArgsHash ?? '').toLowerCase(),
  };
  if (!checks.runtimeBytecode) errors.push('runtime bytecode hash mismatch');
  if (!checks.constructorArgs) errors.push('constructor args hash mismatch');
  return { address: expected.address, chainId: expected.chainId, ok: checks.runtimeBytecode && checks.constructorArgs, checks, errors };
}
