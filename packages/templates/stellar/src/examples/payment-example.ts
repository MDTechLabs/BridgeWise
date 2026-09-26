import { PaymentTemplate } from '../templates/payment-template';
import type { StellarTemplateConfig, TemplateResult, PaymentOperation } from '../types';

export class PaymentExample {
  private template: PaymentTemplate;

  constructor() {
    this.template = new PaymentTemplate();
  }

  getTemplate(): PaymentTemplate {
    return this.template;
  }

  createDefaultConfig(): StellarTemplateConfig {
    return {
      templateType: 'payment',
      network: 'testnet',
      sourceAccount: 'GBEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
      fee: 100,
      timeout: 30,
      memo: 'Welcome bonus',
      customConfig: {
        destination: 'GBDESTINATION567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
        amount: '10.5',
        asset: 'native',
      },
    };
  }

  runExample(): TemplateResult<PaymentOperation> {
    const config = this.createDefaultConfig();
    const warnings = this.template.validate(config);

    if (warnings.length > 0) {
      return { success: false, error: warnings.join(', ') };
    }

    const operation = this.template.generate(config);
    return { success: true, data: operation };
  }
}
