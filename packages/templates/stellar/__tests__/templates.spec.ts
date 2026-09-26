import {
  BaseStellarTemplate,
  PaymentTemplate,
  DexTemplate,
  NftTemplate,
} from '../src/templates';
import type { StellarTemplateConfig } from '../src/types';

describe('BaseStellarTemplate', () => {
  const template = new BaseStellarTemplate();

  it('should have correct metadata', () => {
    expect(template.id).toBe('stellar-base');
    expect(template.type).toBe('custom');
    expect(template.version).toBe('1.0.0');
  });

  it('should generate config with default values', () => {
    const result = template.generate({
      templateType: 'custom',
      network: 'testnet',
      sourceAccount: 'GBX...',
    }) as Record<string, unknown>;

    const networkConfig = result.networkConfig as Record<string, unknown>;
    expect(networkConfig).toBeDefined();
    expect(networkConfig.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(networkConfig.passphrase).toContain('Test SDF Network');
  });

  it('should validate source account is required', () => {
    const errors = template.validate({
      templateType: 'custom',
      network: 'testnet',
      sourceAccount: '',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('required');
  });

  it('should validate account format', () => {
    const errors = template.validate({
      templateType: 'custom',
      network: 'testnet',
      sourceAccount: 'invalid',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass validation for valid input', () => {
    const errors = template.validate({
      templateType: 'custom',
      network: 'testnet',
      sourceAccount: 'GBX123456789012345678901234567890123456789012345678',
    });
    expect(errors.length).toBe(0);
  });

  it('should validate unknown network', () => {
    const errors = template.validate({
      templateType: 'custom',
      network: 'invalid-network' as any,
      sourceAccount: 'GBX123456789012345678901234567890123456789012345678',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('network'))).toBe(true);
  });

  it('should provide defaults', () => {
    const defaults = template.getDefaults();
    expect(defaults.network).toBe('testnet');
    expect(defaults.fee).toBe(100);
    expect(defaults.timeout).toBe(30);
  });
});

describe('PaymentTemplate', () => {
  const template = new PaymentTemplate();

  it('should have correct metadata', () => {
    expect(template.id).toBe('stellar-payment');
    expect(template.name).toBe('Payment Integration');
    expect(template.type).toBe('payment');
    expect(template.version).toBe('1.0.0');
  });

  it('should generate payment operation', () => {
    const config: StellarTemplateConfig = {
      templateType: 'payment',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: {
        destination: 'GBDEST...',
        amount: '50',
        asset: 'native',
      },
    };

    const result = template.generate(config);
    expect(result.destination).toBe('GBDEST...');
    expect(result.amount).toBe('50');
    expect(result.asset).toBe('native');
  });

  it('should validate missing destination', () => {
    const errors = template.validate({
      templateType: 'payment',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: { amount: '50' },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('Destination'))).toBe(true);
  });

  it('should validate invalid amount', () => {
    const errors = template.validate({
      templateType: 'payment',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: { destination: 'GDEST...', amount: '-5' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should provide defaults', () => {
    const defaults = template.getDefaults();
    expect(defaults.network).toBe('testnet');
    expect(defaults.fee).toBe(100);
  });
});

describe('DexTemplate', () => {
  const template = new DexTemplate();

  it('should have correct metadata', () => {
    expect(template.id).toBe('stellar-dex');
    expect(template.name).toBe('DEX Integration');
    expect(template.type).toBe('dex');
  });

  it('should generate DEX operation with min buy amount', () => {
    const config: StellarTemplateConfig = {
      templateType: 'dex',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: {
        sellAsset: 'native',
        buyAsset: 'USDC:GB...',
        sellAmount: '100',
        slippage: 0.5,
      },
    };

    const result = template.generate(config);
    expect(result.sellAsset).toBe('native');
    expect(result.buyAsset).toBe('USDC:GB...');
    expect(result.sellAmount).toBe('100');
    expect(result.minBuyAmount).toBe('99.5');
  });

  it('should validate required assets', () => {
    const errors = template.validate({
      templateType: 'dex',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: { sellAmount: '100' },
    });
    expect(errors.some(e => e.includes('asset'))).toBe(true);
  });

  it('should provide defaults including slippage', () => {
    const defaults = template.getDefaults();
    expect(defaults.customConfig).toBeDefined();
    expect((defaults.customConfig as any).slippage).toBe(0.5);
  });
});

describe('NftTemplate', () => {
  const template = new NftTemplate();

  it('should have correct metadata', () => {
    expect(template.id).toBe('stellar-nft');
    expect(template.name).toBe('NFT Integration');
    expect(template.type).toBe('nft');
  });

  it('should generate balance query', () => {
    const config: StellarTemplateConfig = {
      templateType: 'nft',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: {
        contractId: 'CA123456789012345678901234567890123456789012345678',
        action: 'balance',
        operator: 'GBOP...',
        tokenId: '1',
      },
    };

    const result = template.generate(config);
    expect(result.contractId).toContain('CA');
    expect(result.tokenId).toBe('1');
  });

  it('should generate transfer operation', () => {
    const config: StellarTemplateConfig = {
      templateType: 'nft',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: {
        contractId: 'CA123456789012345678901234567890123456789012345678',
        action: 'transfer',
        from: 'GBFROM...',
        to: 'GBTO...',
        tokenId: '42',
      },
    };

    const result = template.generate(config);
    expect(result.from).toBe('GBFROM...');
    expect(result.to).toBe('GBTO...');
    expect(result.tokenId).toBe('42');
  });

  it('should validate contract ID', () => {
    const errors = template.validate({
      templateType: 'nft',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: { action: 'mint' },
    });
    expect(errors.some(e => e.includes('Contract ID'))).toBe(true);
  });

  it('should validate action is present', () => {
    const errors = template.validate({
      templateType: 'nft',
      network: 'testnet',
      sourceAccount: 'GBSOURCE...',
      customConfig: { contractId: 'CA123456789012345678901234567890123456789012345678' },
    });
    expect(errors.some(e => e.includes('Action'))).toBe(true);
  });
});

describe('NETWORK_PRESETS', () => {
  const { NETWORK_PRESETS } = require('../src/config');

  it('should have all required network presets', () => {
    expect(NETWORK_PRESETS.public).toBeDefined();
    expect(NETWORK_PRESETS.testnet).toBeDefined();
    expect(NETWORK_PRESETS.futurenet).toBeDefined();
    expect(NETWORK_PRESETS.sandbox).toBeDefined();
    expect(NETWORK_PRESETS.custom).toBeDefined();
  });

  it('should have correct Horizon URLs', () => {
    expect(NETWORK_PRESETS.public.horizonUrl).toBe('https://horizon.stellar.org');
    expect(NETWORK_PRESETS.testnet.horizonUrl).toBe('https://horizon-testnet.stellar.org');
  });

  it('should have RPC URLs for non-custom networks', () => {
    expect(NETWORK_PRESETS.public.rpcUrl).toBeDefined();
    expect(NETWORK_PRESETS.testnet.rpcUrl).toBeDefined();
    expect(NETWORK_PRESETS.custom.rpcUrl).toBeUndefined();
  });
});
