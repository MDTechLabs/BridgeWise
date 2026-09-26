import { SorobanTemplate } from '../templates/soroban-template';
import type {
  StellarTemplateConfig,
  TemplateResult,
  SorobanOperation,
} from '../types';

export class SorobanExample {
  private template: SorobanTemplate;

  constructor() {
    this.template = new SorobanTemplate();
  }

  getTemplate(): SorobanTemplate {
    return this.template;
  }

  createDefaultConfig(): StellarTemplateConfig {
    return {
      templateType: 'soroban',
      network: 'testnet',
      sourceAccount: 'GBEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
      fee: 100,
      timeout: 30,
      customConfig: {
        contractId: 'CCONTRACT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
        functionName: 'increment',
        args: JSON.stringify([
          { name: 'counter_name', type: 'symbol', value: 'user_clicks' },
        ]),
        simulated: true,
      },
    };
  }

  runExample(): TemplateResult<SorobanOperation> {
    const config = this.createDefaultConfig();
    const warnings = this.template.validate(config);

    if (warnings.length > 0) {
      return { success: false, error: warnings.join(', ') };
    }

    const operation = this.template.generate(config);
    return { success: true, data: operation };
  }
}
