export interface SorobanContractDeploymentRecord {
  contractId: string;
  network: string;
  address: string;
  deployedAt?: number;
  wasmHash?: string;
}

export interface SorobanContractDeploymentVerificationResult {
  contractId: string;
  isDeployed: boolean;
  verifiedAt: number;
  issues: string[];
}

const CONTRACT_ADDRESS_REGEX = /^C[A-Z0-9]{55}$/;

export class SorobanContractDeploymentVerifier {
  verify(
    deployment: SorobanContractDeploymentRecord,
  ): SorobanContractDeploymentVerificationResult {
    const issues: string[] = [];

    if (!deployment.contractId.trim()) {
      issues.push('missing contract id');
    }

    if (!CONTRACT_ADDRESS_REGEX.test(deployment.address)) {
      issues.push('invalid contract address');
    }

    if (!deployment.network.trim()) {
      issues.push('missing network');
    }

    return {
      contractId: deployment.contractId,
      isDeployed: issues.length === 0,
      verifiedAt: Date.now(),
      issues,
    };
  }
}

