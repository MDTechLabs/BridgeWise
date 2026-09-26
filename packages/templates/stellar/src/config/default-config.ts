import type { NetworkPreset, StellarNetworkConfig } from '../types';

export const NETWORK_PRESETS: Record<NetworkPreset, StellarNetworkConfig> = {
  public: {
    network: 'public',
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban-rpc.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
  testnet: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    friendbotUrl: 'https://friendbot.stellar.org',
  },
  futurenet: {
    network: 'futurenet',
    horizonUrl: 'https://horizon-futurenet.stellar.org',
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    passphrase: 'Test SDF Future Network ; October 2022',
    friendbotUrl: 'https://friendbot-futurenet.stellar.org',
  },
  sandbox: {
    network: 'sandbox',
    horizonUrl: 'http://localhost:8000',
    rpcUrl: 'http://localhost:8001/soroban/rpc',
    passphrase: 'Local Sandbox Stellar Network ; June 2025',
  },
  custom: {
    network: 'custom',
    horizonUrl: '',
    passphrase: '',
  },
};

export const DEFAULT_FEE = 100;
export const DEFAULT_TIMEOUT = 30;
export const DEFAULT_BASE_RESERVE = 0.5;
export const DEFAULT_NETWORK = 'testnet' as NetworkPreset;

export const TEMPLATE_VARIABLES = {
  payment: [
    {
      key: 'destination',
      label: 'Destination Address',
      description: 'Recipient Stellar public key (G...)',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'amount',
      label: 'Payment Amount',
      description: 'Amount to send (in XLM)',
      type: 'number' as const,
      required: true,
    },
    {
      key: 'asset',
      label: 'Asset Type',
      description: 'Asset to send (native or custom)',
      type: 'select' as const,
      required: false,
      defaultValue: 'native',
      options: ['native', 'USDC', 'custom'],
    },
    {
      key: 'memo',
      label: 'Memo',
      description: 'Optional memo text',
      type: 'string' as const,
      required: false,
    },
  ],
  dex: [
    {
      key: 'sellAsset',
      label: 'Sell Asset',
      description: 'Asset to sell',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'buyAsset',
      label: 'Buy Asset',
      description: 'Asset to buy',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'sellAmount',
      label: 'Sell Amount',
      description: 'Amount to sell',
      type: 'number' as const,
      required: true,
    },
    {
      key: 'slippage',
      label: 'Slippage Tolerance',
      description: 'Maximum slippage percentage',
      type: 'number' as const,
      required: false,
      defaultValue: 0.5,
    },
  ],
  nft: [
    {
      key: 'contractId',
      label: 'Contract ID',
      description: 'Soroban NFT contract ID',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'action',
      label: 'Action',
      description: 'NFT operation to perform',
      type: 'select' as const,
      required: true,
      options: ['mint', 'transfer', 'burn', 'balance'],
    },
  ],
  soroban: [
    {
      key: 'contractId',
      label: 'Smart Contract ID',
      description: 'Soroban contract identifier (C...)',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'functionName',
      label: 'Function Name',
      description: 'Smart contract function to invoke',
      type: 'string' as const,
      required: true,
    },
    {
      key: 'args',
      label: 'Arguments Json String',
      description: 'Serialized JSON array of contract inputs',
      type: 'string' as const,
      required: false,
      defaultValue: '[]',
    },
  ],
};

export const STELLAR_TEMPLATE_META = {
  payment: {
    id: 'stellar-payment',
    name: 'Payment Integration',
    description: 'Basic Stellar payment sending and receiving integration',
    version: '1.0.0',
  },
  dex: {
    id: 'stellar-dex',
    name: 'DEX Integration',
    description: 'Stellar decentralized exchange order management',
    version: '1.0.0',
  },
  nft: {
    id: 'stellar-nft',
    name: 'NFT Integration',
    description: 'Soroban-based NFT contract interaction template',
    version: '1.0.0',
  },
  soroban: {
    id: 'soroban-playground',
    name: 'Soroban Developer Playground',
    description:
      'Starter smart contract invocation template for Soroban environments',
    version: '1.0.0',
  },
};
