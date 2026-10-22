import {
  ContractErrorSpec,
  ContractEventSpec,
  ContractFunctionSpec,
  ContractInterfaceMetadata,
  ContractParameterSpec,
  MetadataStatus,
} from '../../contracts/metadata/soroban/soroban-metadata.types';
import {
  DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES,
  ExpectedContractCapabilities,
  ExpectedEventCapability,
  ExpectedMethodCapability,
  normalizeType,
} from '../../contracts/metadata/bridgewise-interface';

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

  check(
    metadata: ContractInterfaceMetadata | null | undefined,
  ): CompatibilityCheckResult {
    const issues: CompatibilityIssue[] = [];
    const contractAddress =
      typeof metadata?.contractAddress === 'string'
        ? metadata.contractAddress
        : '';

    if (!metadata) {
      return {
        compatible: false,
        contractAddress,
        issues: [
          {
            code: 'METADATA_MISSING',
            severity: 'error',
            message:
              'Contract metadata is missing; cannot verify BridgeWise compatibility.',
          },
        ],
        verifiedMethods: [],
        missingMethods: this.expected.methods.map((method) => method.name),
      };
    }

    this.validateMetadata(metadata, issues);

    const functionsByName = new Map<string, ContractFunctionSpec>();
    const functions = Array.isArray(metadata.functions)
      ? metadata.functions
      : [];
    for (const fn of functions) {
      if (fn && typeof fn.name === 'string' && fn.name.trim()) {
        functionsByName.set(fn.name, fn);
      }
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
      this.verifyReturnType(method, found, issues);
      verifiedMethods.push(method.name);
    }

    this.verifyEvents(metadata.events, issues);
    this.verifyErrors(metadata.errors, issues);

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
    if (
      typeof metadata.contractAddress !== 'string' ||
      !metadata.contractAddress.trim()
    ) {
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
    } else {
      this.validateFunctions(metadata.functions, issues);
    }
    if (metadata.events !== undefined && !Array.isArray(metadata.events)) {
      issues.push({
        code: 'INVALID_METADATA',
        severity: 'error',
        message: 'Contract metadata events must be a list.',
      });
    }
    if (metadata.errors !== undefined && !Array.isArray(metadata.errors)) {
      issues.push({
        code: 'INVALID_METADATA',
        severity: 'error',
        message: 'Contract metadata errors must be a list.',
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
      typeof metadata.specVersion === 'string' &&
      !metadata.specVersion.startsWith(this.expected.specVersionPrefix)
    ) {
      issues.push({
        code: 'SPEC_VERSION_MISMATCH',
        severity: 'warning',
        message: `Spec version "${metadata.specVersion}" does not start with expected prefix "${this.expected.specVersionPrefix}".`,
      });
    }
  }

  private validateFunctions(
    functions: ContractFunctionSpec[],
    issues: CompatibilityIssue[],
  ): void {
    const seen = new Set<string>();

    for (const fn of functions as Array<
      ContractFunctionSpec | null | undefined
    >) {
      if (!fn || typeof fn.name !== 'string' || !fn.name.trim()) {
        issues.push({
          code: 'INVALID_METHOD',
          severity: 'error',
          message: 'Contract metadata contains a method without a valid name.',
        });
        continue;
      }

      if (seen.has(fn.name)) {
        issues.push({
          code: 'DUPLICATE_METHOD',
          severity: 'error',
          method: fn.name,
          message: `Contract metadata declares method "${fn.name}" more than once.`,
        });
      }
      seen.add(fn.name);

      if (!Array.isArray(fn.parameters)) {
        issues.push({
          code: 'INVALID_METHOD',
          severity: 'error',
          method: fn.name,
          message: `Method "${fn.name}" does not include a valid parameter list.`,
        });
        continue;
      }

      const parameterNames = new Set<string>();
      for (const parameter of fn.parameters as Array<
        ContractParameterSpec | null | undefined
      >) {
        if (
          !parameter ||
          typeof parameter.name !== 'string' ||
          !parameter.name.trim() ||
          typeof parameter.type !== 'string' ||
          !parameter.type.trim()
        ) {
          issues.push({
            code: 'INVALID_METHOD_PARAMETER',
            severity: 'error',
            method: fn.name,
            message: `Method "${fn.name}" contains a parameter without a valid name or type.`,
          });
          continue;
        }
        if (parameterNames.has(parameter.name)) {
          issues.push({
            code: 'DUPLICATE_METHOD_PARAMETER',
            severity: 'error',
            method: fn.name,
            message: `Method "${fn.name}" declares parameter "${parameter.name}" more than once.`,
          });
        }
        parameterNames.add(parameter.name);
      }
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
      if (!actualArg) return;
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

  private verifyReturnType(
    expected: ExpectedMethodCapability,
    actual: ContractFunctionSpec,
    issues: CompatibilityIssue[],
  ): void {
    if (!expected.returnType) return;

    if (typeof actual.returnType !== 'string' || !actual.returnType.trim()) {
      issues.push({
        code: 'RETURN_TYPE_MISSING',
        severity: 'error',
        method: expected.name,
        message: `Method "${expected.name}" is missing the expected return type "${expected.returnType}".`,
      });
      return;
    }

    if (
      normalizeType(actual.returnType) !== normalizeType(expected.returnType)
    ) {
      issues.push({
        code: 'RETURN_TYPE_MISMATCH',
        severity: 'error',
        method: expected.name,
        message: `Method "${expected.name}" expected return type "${expected.returnType}" but found "${actual.returnType}".`,
      });
    }
  }

  private verifyEvents(
    events: ContractEventSpec[] | undefined,
    issues: CompatibilityIssue[],
  ): void {
    const expectedEvents = this.expected.events ?? [];
    if (expectedEvents.length === 0) return;
    if (!Array.isArray(events)) return;

    const eventsByName = new Map<string, ContractEventSpec>();
    for (const event of events) {
      if (event && typeof event.name === 'string') {
        eventsByName.set(event.name, event);
      }
    }

    for (const expected of expectedEvents) {
      const actual = eventsByName.get(expected.name);
      if (!actual) {
        issues.push({
          code: 'MISSING_EVENT',
          severity: 'error',
          message: `Required event "${expected.name}" is not present on the contract.`,
        });
        continue;
      }
      this.verifyEventFields(expected, actual, issues);
    }
  }

  private verifyEventFields(
    expected: ExpectedEventCapability,
    actual: ContractEventSpec,
    issues: CompatibilityIssue[],
  ): void {
    const actualFields = actual.fields ?? [];
    if (actualFields.length !== expected.fields.length) {
      issues.push({
        code: 'EVENT_FIELD_COUNT_MISMATCH',
        severity: 'error',
        message: `Event "${expected.name}" expects ${expected.fields.length} field(s) but found ${actualFields.length}.`,
      });
      return;
    }

    expected.fields.forEach((field, index) => {
      const actualField = actualFields[index];
      if (!actualField) return;
      if (actualField.name !== field.name) {
        issues.push({
          code: 'EVENT_FIELD_NAME_MISMATCH',
          severity: 'error',
          message: `Event "${expected.name}" field ${index} expected name "${field.name}" but found "${actualField.name}".`,
        });
      }
      if (normalizeType(actualField.type) !== normalizeType(field.type)) {
        issues.push({
          code: 'EVENT_FIELD_TYPE_MISMATCH',
          severity: 'error',
          message: `Event "${expected.name}" field "${field.name}" expected type "${field.type}" but found "${actualField.type}".`,
        });
      }
    });
  }

  private verifyErrors(
    errors: ContractErrorSpec[] | undefined,
    issues: CompatibilityIssue[],
  ): void {
    const expectedErrors = this.expected.errors ?? [];
    if (expectedErrors.length === 0) return;
    if (!Array.isArray(errors)) return;

    const errorsByCode = new Map<number, ContractErrorSpec>();
    for (const error of errors) {
      if (error && typeof error.code === 'number') {
        errorsByCode.set(error.code, error);
      }
    }

    for (const expected of expectedErrors) {
      const actual = errorsByCode.get(expected.code);
      if (!actual) {
        issues.push({
          code: 'MISSING_ERROR',
          severity: 'error',
          message: `Required error code ${expected.code} ("${expected.name}") is not present on the contract.`,
        });
        continue;
      }
      if (actual.name !== expected.name) {
        issues.push({
          code: 'ERROR_NAME_MISMATCH',
          severity: 'error',
          message: `Error code ${expected.code} expected name "${expected.name}" but found "${actual.name}".`,
        });
      }
    }
  }
}
