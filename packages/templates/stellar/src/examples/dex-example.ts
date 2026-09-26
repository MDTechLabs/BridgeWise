import { DexTemplate } from '../templates/dex-template';
import type { StellarTemplateConfig, TemplateResult, DexOperation } from '../types';

export class DexExample {
  private template: DexTemplate;

  constructor() {
    this.template = new DexTemplate();
  }

  getTemplate(): DexTemplate {
    return this.template;
  }

  createDefaultConfig(): StellarTemplateConfig {
    return {
      templateType: 'dex',
      network: 'testnet',
      sourceAccount: 'GBEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
      fee: 100,
      timeout: 30,
      customConfig: {
        sellAsset: 'native',
        buyAsset: 'USDC:GBPORT...',
        sellAmount: '100',
        slippage: 0.5,
      },
    };
  }

  runExample(): TemplateResult<DexOperation> {
    const config = this.createDefaultConfig();
    const warnings = this.template.validate(config);

    if (warnings.length > 0) {
      return { success: false, error: warnings.join(', ') };
    }

    const operation = this.template.generate(config);
    return { success: true, data: operation };
  }
}
