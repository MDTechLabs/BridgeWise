import {
  StellarTemplate,
  StellarTemplateConfig,
  TemplateResult,
  PaymentOperation,
  TemplateVariable,
} from '../types';
import {
  NETWORK_PRESETS,
  DEFAULT_FEE,
  DEFAULT_TIMEOUT,
  TEMPLATE_VARIABLES,
  STELLAR_TEMPLATE_META,
} from '../config/default-config';

export class PaymentTemplate implements StellarTemplate {
  readonly id = STELLAR_TEMPLATE_META.payment.id;
  readonly name = STELLAR_TEMPLATE_META.payment.name;
  readonly description = STELLAR_TEMPLATE_META.payment.description;
  readonly type = 'payment' as const;
  readonly version = STELLAR_TEMPLATE_META.payment.version;
  readonly variables: TemplateVariable[] = TEMPLATE_VARIABLES.payment;

  generate(config: StellarTemplateConfig): PaymentOperation {
    const network = NETWORK_PRESETS[config.network];

    return {
      destination: config.customConfig?.destination as string,
      amount: config.customConfig?.amount as string,
      asset: (config.customConfig?.asset as string) || 'native',
      issuer: config.customConfig?.issuer as string,
    };
  }

  validate(config: StellarTemplateConfig): string[] {
    const errors: string[] = [];
    const dest = config.customConfig?.destination as string;

    if (!dest) {
      errors.push('Destination address is required');
    } else if (!dest.startsWith('G') || dest.length !== 56) {
      errors.push('Invalid Stellar destination address format');
    }

    const amount = config.customConfig?.amount as string;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      errors.push('Amount must be a positive number');
    }

    return errors;
  }

  getDefaults(): Partial<StellarTemplateConfig> {
    return {
      fee: DEFAULT_FEE,
      timeout: DEFAULT_TIMEOUT,
      network: 'testnet',
    };
  }
}
