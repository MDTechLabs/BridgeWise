/**
 * Expected BridgeWise interface capabilities for a Soroban bridge contract.
 */

export interface ExpectedMethodCapability {
  name: string;
  arguments: Array<{ name: string; type: string }>;
  returnType?: string;
}

export interface ExpectedContractCapabilities {
  specVersionPrefix?: string;
  methods: ExpectedMethodCapability[];
  requiredMetadata?: string[];
}

export const DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES: ExpectedContractCapabilities = {
  specVersionPrefix: '1',
  methods: [
    {
      name: 'bridge',
      arguments: [
        { name: 'source_chain', type: 'string' },
        { name: 'target_chain', type: 'string' },
        { name: 'amount', type: 'i128' },
        { name: 'recipient', type: 'address' },
      ],
      returnType: 'bytes',
    },
    {
      name: 'quote',
      arguments: [
        { name: 'source_chain', type: 'string' },
        { name: 'target_chain', type: 'string' },
        { name: 'amount', type: 'i128' },
      ],
      returnType: 'i128',
    },
    {
      name: 'cancel',
      arguments: [{ name: 'operation_id', type: 'bytes' }],
      returnType: 'void',
    },
  ],
  requiredMetadata: ['contractAddress', 'network', 'functions'],
};

export function normalizeType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, '');
}
