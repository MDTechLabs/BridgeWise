import {
  MetadataNetwork,
  MetadataStatus,
  ContractInterfaceMetadata,
} from '../../../src/contracts/metadata/soroban';
import { DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES } from '../../../src/contracts/metadata';
import { SorobanContractCompatibilityChecker } from '../../../src/soroban/compatibility';

function compatibleMetadata(
  overrides: Partial<ContractInterfaceMetadata> = {},
): ContractInterfaceMetadata {
  return {
    contractAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
    network: MetadataNetwork.TESTNET,
    specVersion: '1.0',
    resolvedAt: Date.now(),
    status: MetadataStatus.RESOLVED,
    functions: DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods.map((method) => ({
      name: method.name,
      parameters: method.arguments.map((arg) => ({ name: arg.name, type: arg.type })),
      returnType: method.returnType,
    })),
    events: [],
    errors: [],
    ...overrides,
  };
}

describe('SorobanContractCompatibilityChecker (#998)', () => {
  const checker = new SorobanContractCompatibilityChecker();

  it('accepts a contract that matches expected capabilities', () => {
    const result = checker.check(compatibleMetadata());
    expect(result.compatible).toBe(true);
    expect(result.missingMethods).toEqual([]);
    expect(result.verifiedMethods).toEqual(['bridge', 'quote', 'cancel']);
  });

  it('rejects a contract missing required methods', () => {
    const result = checker.check(
      compatibleMetadata({
        functions: [
          {
            name: 'bridge',
            parameters: DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[0].arguments,
          },
        ],
      }),
    );
    expect(result.compatible).toBe(false);
    expect(result.missingMethods).toEqual(['quote', 'cancel']);
    expect(result.issues.some((issue) => issue.code === 'MISSING_METHOD')).toBe(true);
  });

  it('rejects argument mismatches', () => {
    const result = checker.check(
      compatibleMetadata({
        functions: [
          {
            name: 'bridge',
            parameters: [{ name: 'amount', type: 'u32' }],
          },
          {
            name: 'quote',
            parameters: DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[1].arguments,
          },
          {
            name: 'cancel',
            parameters: DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[2].arguments,
          },
        ],
      }),
    );
    expect(result.compatible).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ARGUMENT_COUNT_MISMATCH')).toBe(true);
  });

  it('rejects missing metadata', () => {
    const result = checker.check(null);
    expect(result.compatible).toBe(false);
    expect(result.issues[0].code).toBe('METADATA_MISSING');
  });
});
