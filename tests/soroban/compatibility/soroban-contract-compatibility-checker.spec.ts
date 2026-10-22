import {
  MetadataNetwork,
  MetadataStatus,
  ContractInterfaceMetadata,
  ContractFunctionSpec,
} from '../../../src/contracts/metadata/soroban';
import {
  DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES,
  ExpectedContractCapabilities,
  ExpectedMethodCapability,
} from '../../../src/contracts/metadata';
import { SorobanContractCompatibilityChecker } from '../../../src/soroban/compatibility';

const CONTRACT_ADDRESS =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M';

function toFunctionSpec(
  method: ExpectedMethodCapability,
): ContractFunctionSpec {
  return {
    name: method.name,
    parameters: method.arguments.map((argument) => ({ ...argument })),
    returnType: method.returnType,
  };
}

function compatibleFunctions(): ContractFunctionSpec[] {
  return DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods.map(toFunctionSpec);
}

function compatibleMetadata(
  overrides: Partial<ContractInterfaceMetadata> = {},
): ContractInterfaceMetadata {
  return {
    contractAddress: CONTRACT_ADDRESS,
    network: MetadataNetwork.TESTNET,
    specVersion: '1.0',
    resolvedAt: Date.now(),
    status: MetadataStatus.RESOLVED,
    functions: compatibleFunctions(),
    events: [],
    errors: [],
    ...overrides,
  };
}

function replaceFunction(
  name: string,
  replacement: Partial<ContractFunctionSpec>,
): ContractFunctionSpec[] {
  return compatibleFunctions().map((fn) =>
    fn.name === name ? { ...fn, ...replacement } : fn,
  );
}

describe('SorobanContractCompatibilityChecker (#1335)', () => {
  const checker = new SorobanContractCompatibilityChecker();

  describe('success cases', () => {
    it('accepts a contract that exactly matches the expected interface', () => {
      const result = checker.check(compatibleMetadata());

      expect(result.compatible).toBe(true);
      expect(result.contractAddress).toBe(CONTRACT_ADDRESS);
      expect(result.issues).toEqual([]);
      expect(result.missingMethods).toEqual([]);
      expect(result.verifiedMethods).toEqual(['bridge', 'quote', 'cancel']);
    });

    it('normalizes type casing and whitespace across the interface', () => {
      const functions = compatibleFunctions().map((fn) => ({
        ...fn,
        parameters: fn.parameters.map((parameter) => ({
          ...parameter,
          type: ` ${parameter.type.toUpperCase()} `,
        })),
        returnType: fn.returnType
          ? ` ${fn.returnType.toUpperCase()} `
          : fn.returnType,
      }));

      const result = checker.check(compatibleMetadata({ functions }));

      expect(result.compatible).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('accepts stale metadata and permits additional non-required methods', () => {
      const result = checker.check(
        compatibleMetadata({
          status: MetadataStatus.STALE,
          functions: [
            ...compatibleFunctions(),
            {
              name: 'admin_withdraw',
              parameters: [{ name: 'amount', type: 'i128' }],
              returnType: 'void',
            },
          ],
        }),
      );

      expect(result.compatible).toBe(true);
      expect(result.verifiedMethods).toEqual(['bridge', 'quote', 'cancel']);
    });

    it('accepts metadata without an optional spec version', () => {
      const { specVersion, ...metadata } = compatibleMetadata();
      const result = checker.check(metadata as ContractInterfaceMetadata);

      expect(result.compatible).toBe(true);
      expect(specVersion).toBeDefined();
    });
  });

  describe('boundary cases', () => {
    it('treats an unexpected spec version as a warning rather than a failure', () => {
      const result = checker.check(compatibleMetadata({ specVersion: '2.0' }));

      expect(result.compatible).toBe(true);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'SPEC_VERSION_MISMATCH',
            severity: 'warning',
          }),
        ]),
      );
    });

    it('validates custom expected events and errors', () => {
      const expected: ExpectedContractCapabilities = {
        specVersionPrefix: '1',
        methods: DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods,
        events: [
          {
            name: 'transfer_completed',
            fields: [
              { name: 'operation_id', type: 'bytes' },
              { name: 'amount', type: 'i128' },
            ],
          },
        ],
        errors: [{ code: 1, name: 'Unauthorized' }],
      };
      const customChecker = new SorobanContractCompatibilityChecker(expected);

      const result = customChecker.check(
        compatibleMetadata({
          events: [
            {
              name: 'transfer_completed',
              fields: [
                { name: 'operation_id', type: 'Bytes' },
                { name: 'amount', type: 'I128' },
              ],
            },
          ],
          errors: [{ code: 1, name: 'Unauthorized' }],
        }),
      );

      expect(result.compatible).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('accepts an empty function list when no methods are required', () => {
      const customChecker = new SorobanContractCompatibilityChecker({
        methods: [],
      });

      const result = customChecker.check(
        compatibleMetadata({ functions: [], events: [], errors: [] }),
      );

      expect(result.compatible).toBe(true);
      expect(result.verifiedMethods).toEqual([]);
    });
  });

  describe('invalid input cases', () => {
    it('rejects missing metadata', () => {
      const result = checker.check(null);

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'METADATA_MISSING',
          severity: 'error',
        }),
      ]);
      expect(result.missingMethods).toEqual(['bridge', 'quote', 'cancel']);
    });

    it('rejects blank contract addresses', () => {
      const result = checker.check(
        compatibleMetadata({ contractAddress: '   ' }),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'INVALID_METADATA'),
      ).toBe(true);
    });

    it('rejects missing network information', () => {
      const metadata = compatibleMetadata();
      delete (metadata as Partial<ContractInterfaceMetadata>).network;

      const result = checker.check(metadata);

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'INVALID_METADATA'),
      ).toBe(true);
    });

    it.each([
      MetadataStatus.UNAVAILABLE,
      MetadataStatus.PENDING,
      MetadataStatus.ERROR,
    ])('rejects metadata with status %s', (status) => {
      const result = checker.check(compatibleMetadata({ status }));

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'METADATA_NOT_READY',
            severity: 'error',
          }),
        ]),
      );
    });

    it('rejects malformed functions containers', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: 'not-a-list',
        } as unknown as ContractInterfaceMetadata),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'INVALID_METADATA'),
      ).toBe(true);
    });

    it('rejects methods without names', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: [
            ...compatibleFunctions(),
            { name: '  ', parameters: [], returnType: 'void' },
          ],
        }),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'INVALID_METHOD'),
      ).toBe(true);
    });

    it('rejects duplicate method declarations', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: [
            ...compatibleFunctions(),
            toFunctionSpec(DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[0]),
          ],
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'DUPLICATE_METHOD',
            method: 'bridge',
          }),
        ]),
      );
    });

    it('rejects methods without a valid parameter list', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('quote', {
            parameters:
              undefined as unknown as ContractFunctionSpec['parameters'],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'INVALID_METHOD'),
      ).toBe(true);
    });

    it('rejects parameters without names or types', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('bridge', {
            parameters: [
              { name: 'source_chain', type: 'string' },
              { name: 'target_chain', type: 'string' },
              { name: 'amount', type: '' },
              { name: 'recipient', type: 'address' },
            ],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some(
          (issue) => issue.code === 'INVALID_METHOD_PARAMETER',
        ),
      ).toBe(true);
    });

    it('fails closed instead of throwing on hostile metadata shapes', () => {
      const hostile = {
        contractAddress: 123,
        network: null,
        specVersion: 1,
        resolvedAt: 'not-a-number',
        status: MetadataStatus.RESOLVED,
        functions: [
          {
            name: 'bridge',
            parameters: [null],
            returnType: 42,
          },
        ],
        events: {},
        errors: {},
      } as unknown as ContractInterfaceMetadata;

      let result!: ReturnType<SorobanContractCompatibilityChecker['check']>;
      expect(() => {
        result = checker.check(hostile);
      }).not.toThrow();
      expect(result!.compatible).toBe(false);
      expect(result!.issues.length).toBeGreaterThan(0);
    });

    it('rejects duplicate parameter names', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('quote', {
            parameters: [
              { name: 'source_chain', type: 'string' },
              { name: 'source_chain', type: 'string' },
              { name: 'amount', type: 'i128' },
            ],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(
        result.issues.some(
          (issue) => issue.code === 'DUPLICATE_METHOD_PARAMETER',
        ),
      ).toBe(true);
    });
  });

  describe('failure cases', () => {
    it('rejects a contract missing required methods', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: [
            toFunctionSpec(DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[0]),
          ],
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.missingMethods).toEqual(['quote', 'cancel']);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MISSING_METHOD', method: 'quote' }),
          expect.objectContaining({ code: 'MISSING_METHOD', method: 'cancel' }),
        ]),
      );
    });

    it('rejects argument count mismatches', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('bridge', {
            parameters: [{ name: 'amount', type: 'i128' }],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ARGUMENT_COUNT_MISMATCH',
            method: 'bridge',
          }),
        ]),
      );
    });

    it('rejects argument name mismatches', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('quote', {
            parameters: [
              { name: 'from_chain', type: 'string' },
              { name: 'target_chain', type: 'string' },
              { name: 'amount', type: 'i128' },
            ],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ARGUMENT_NAME_MISMATCH',
            method: 'quote',
          }),
        ]),
      );
    });

    it('rejects argument type mismatches', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('cancel', {
            parameters: [{ name: 'operation_id', type: 'string' }],
          }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ARGUMENT_TYPE_MISMATCH',
            method: 'cancel',
          }),
        ]),
      );
    });

    it('rejects missing return types', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('bridge', { returnType: undefined }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'RETURN_TYPE_MISSING',
            method: 'bridge',
          }),
        ]),
      );
    });

    it('rejects return type mismatches', () => {
      const result = checker.check(
        compatibleMetadata({
          functions: replaceFunction('quote', { returnType: 'u64' }),
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'RETURN_TYPE_MISMATCH',
            method: 'quote',
          }),
        ]),
      );
    });

    it('rejects missing required events', () => {
      const customChecker = new SorobanContractCompatibilityChecker({
        methods: [],
        events: [{ name: 'transfer_completed', fields: [] }],
      });

      const result = customChecker.check(compatibleMetadata({ events: [] }));

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MISSING_EVENT' }),
        ]),
      );
    });

    it('rejects event field count, name, and type mismatches', () => {
      const customChecker = new SorobanContractCompatibilityChecker({
        methods: [],
        events: [
          {
            name: 'transfer_completed',
            fields: [
              { name: 'operation_id', type: 'bytes' },
              { name: 'amount', type: 'i128' },
            ],
          },
        ],
      });

      const result = customChecker.check(
        compatibleMetadata({
          events: [
            {
              name: 'transfer_completed',
              fields: [{ name: 'operationId', type: 'string' }],
            },
          ],
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'EVENT_FIELD_COUNT_MISMATCH' }),
        ]),
      );
    });

    it('rejects event field name and type mismatches', () => {
      const customChecker = new SorobanContractCompatibilityChecker({
        methods: [],
        events: [
          {
            name: 'transfer_completed',
            fields: [
              { name: 'operation_id', type: 'bytes' },
              { name: 'amount', type: 'i128' },
            ],
          },
        ],
      });

      const result = customChecker.check(
        compatibleMetadata({
          events: [
            {
              name: 'transfer_completed',
              fields: [
                { name: 'operationId', type: 'bytes' },
                { name: 'amount', type: 'string' },
              ],
            },
          ],
        }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'EVENT_FIELD_NAME_MISMATCH' }),
          expect.objectContaining({ code: 'EVENT_FIELD_TYPE_MISMATCH' }),
        ]),
      );
    });

    it('rejects missing required errors and renamed error codes', () => {
      const customChecker = new SorobanContractCompatibilityChecker({
        methods: [],
        errors: [
          { code: 1, name: 'Unauthorized' },
          { code: 2, name: 'MalformedRequest' },
        ],
      });

      const result = customChecker.check(
        compatibleMetadata({ errors: [{ code: 2, name: 'BadRequest' }] }),
      );

      expect(result.compatible).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MISSING_ERROR' }),
          expect.objectContaining({ code: 'ERROR_NAME_MISMATCH' }),
        ]),
      );
    });

    it('does not copy sensitive contract metadata into results', () => {
      const metadata = compatibleMetadata({
        extra: {
          privateKey: 'S-SECRET-DO-NOT-LEAK',
          accessToken: 'token-secret',
          payload: 'sensitive-transaction-payload',
        },
      });

      const result = checker.check(metadata);
      const serialized = JSON.stringify(result);

      expect(result.compatible).toBe(true);
      expect(serialized).not.toContain('S-SECRET-DO-NOT-LEAK');
      expect(serialized).not.toContain('token-secret');
      expect(serialized).not.toContain('sensitive-transaction-payload');
    });
  });
});
