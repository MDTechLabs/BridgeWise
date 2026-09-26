import {
  ContractInterfaceMetadata,
  ContractFunctionSpec,
} from '../../contracts/metadata/soroban/soroban-metadata.types';
import {
  DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES,
  ExpectedContractCapabilities,
  ExpectedMethodCapability,
  normalizeType,
} from '../../contracts/metadata/bridgewise-interface';
import { MetadataStatus } from '../../contracts/metadata/soroban/soroban-metadata.types';

export type CompatibilityIssueSeverity = 'error' | 'warning';

export interface CompatibilityIssue {
  code: string;
  severity: CompatibilityIssueSeverity;
  message: string;
  method?: string;
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  contractAddress: string;
  issues: CompatibilityIssue[];
  verifiedMethods: string[];
  missingMethods: string[];
}

export class SorobanContractCompatibilityChecker {
  constructor(
    private readonly expected: ExpectedContractCapabilities = DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES,
  ) {}

  check(metadata: ContractInterfaceMetadata | null | undefined): CompatibilityCheckResult {
    const issues: CompatibilityIssue[] = [];
    const contractAddress = metadata?.contractAddress ?? '';

    if (!metadata) {
      return {
        compatible: false,
        contractAddress,
        issues: [
          {
            code: 'METADATA_MISSING',
            severity: 'error',
            message: 'Contract metadata is missing; cannot verify BridgeWise compatibility.',
          },
        ],
        verifiedMethods: [],
        missingMethods: this.expected.methods.map((m) => m.name),
      };
    }

    this.validateMetadata(metadata, issues);

    const functionsByName = new Map<string, ContractFunctionSpec>();
    for (const fn of metadata.functions ?? []) {
      functionsByName.set(fn.name, fn);
    }

    const verifiedMethods: string[] = [];
    const missingMethods: string[] = [];

    for (const method of this.expected.methods) {
      const found = functionsByName.get(method.name);
      if (!found) {
        missingMethods.push(method.name);
        issues.push({
          code: 'MISSING_METHOD',
          severity: 'error',
          method: method.name,
          message: `Required method "${method.name}" is not present on the contract.`,
        });
        continue;
      }
      this.verifyArguments(method, found, issues);
      verifiedMethods.push(method.name);
    }

    const compatible = !issues.some((issue) => issue.severity === 'error');
    return {
      compatible,
      contractAddress,
      issues,
      verifiedMethods,
      missingMethods,
    };
  }

  private validateMetadata(
    metadata: ContractInterfaceMetadata,
    issues: CompatibilityIssue[],
  ): void {
    if (!metadata.contractAddress?.trim()) {
      issues.push({
        code: 'INVALID_METADATA',
        severity: 'error',
        message: 'Contract metadata is missing a contractAddress.',
      });
    }
    if (!metadata.network) {
      issues.push({
        code: 'INVALID_METADATA',
        severity: 'error',
        message: 'Contract metadata is missing a network.',
      });
    }
    if (!Array.isArray(metadata.functions)) {
      issues.push({
        code: 'INVALID_METADATA',
        severity: 'error',
        message: 'Contract metadata does not include a functions list.',
      });
    }
    if (
      metadata.status &&
      metadata.status !== MetadataStatus.RESOLVED &&
      metadata.status !== MetadataStatus.STALE
    ) {
      issues.push({
        code: 'METADATA_NOT_READY',
        severity: 'error',
        message: `Contract metadata status "${metadata.status}" is not usable for compatibility checks.`,
      });
    }
    if (
      this.expected.specVersionPrefix &&
      metadata.specVersion &&
      !metadata.specVersion.startsWith(this.expected.specVersionPrefix)
    ) {
      issues.push({
        code: 'SPEC_VERSION_MISMATCH',
        severity: 'warning',
        message: `Spec version "${metadata.specVersion}" does not start with expected prefix "${this.expected.specVersionPrefix}".`,
      });
    }
  }

  private verifyArguments(
    expected: ExpectedMethodCapability,
    actual: ContractFunctionSpec,
    issues: CompatibilityIssue[],
  ): void {
    const actualParams = actual.parameters ?? [];
    if (actualParams.length !== expected.arguments.length) {
      issues.push({
        code: 'ARGUMENT_COUNT_MISMATCH',
        severity: 'error',
        method: expected.name,
        message: `Method "${expected.name}" expects ${expected.arguments.length} argument(s) but found ${actualParams.length}.`,
      });
      return;
    }

    expected.arguments.forEach((arg, index) => {
      const actualArg = actualParams[index];
      if (actualArg.name !== arg.name) {
        issues.push({
          code: 'ARGUMENT_NAME_MISMATCH',
          severity: 'error',
          method: expected.name,
          message: `Method "${expected.name}" argument ${index} expected name "${arg.name}" but found "${actualArg.name}".`,
        });
      }
      if (normalizeType(actualArg.type) !== normalizeType(arg.type)) {
        issues.push({
          code: 'ARGUMENT_TYPE_MISMATCH',
          severity: 'error',
          method: expected.name,
          message: `Method "${expected.name}" argument "${arg.name}" expected type "${arg.type}" but found "${actualArg.type}".`,
        });
      }
    });
  }
}
