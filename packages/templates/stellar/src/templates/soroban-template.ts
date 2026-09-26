import { BaseStellarTemplate } from './base-template';
import {
  StellarTemplate,
  StellarTemplateConfig,
  SorobanOperation,
  TemplateVariable,
} from '../types';
import {
  DEFAULT_FEE,
  DEFAULT_TIMEOUT,
  TEMPLATE_VARIABLES,
  STELLAR_TEMPLATE_META,
} from '../config/default-config';

export class SorobanTemplate
  extends BaseStellarTemplate
  implements StellarTemplate
{
  readonly id = STELLAR_TEMPLATE_META.soroban.id;
  readonly name = STELLAR_TEMPLATE_META.soroban.name;
  readonly description = STELLAR_TEMPLATE_META.soroban.description;
  readonly type = 'soroban' as const;
  readonly version = STELLAR_TEMPLATE_META.soroban.version;
  readonly variables: TemplateVariable[] = TEMPLATE_VARIABLES.soroban;

  generate(config: StellarTemplateConfig): SorobanOperation {
    let parsedArgs = [];
    if (config.customConfig?.args) {
      try {
        parsedArgs =
          typeof config.customConfig.args === 'string'
            ? JSON.parse(config.customConfig.args)
            : config.customConfig.args;
      } catch {
        // Fallback or bubble error during integration runtime
        parsedArgs = [];
      }
    }

    return {
      contractId: config.customConfig?.contractId as string,
      functionName: config.customConfig?.functionName as string,
      args: parsedArgs,
      simulated: config.customConfig?.simulated !== false,
    };
  }

  override validate(config: StellarTemplateConfig): string[] {
    const errors = super.validate(config);
    const contractId = config.customConfig?.contractId as string;

    if (!contractId) {
      errors.push('Contract ID is required');
    } else if (!contractId.startsWith('C') || contractId.length !== 56) {
      errors.push(
        'Invalid Soroban contract ID format (Must start with C and be 56 chars)',
      );
    }

    if (!config.customConfig?.functionName) {
      errors.push('Function name is required');
    }

    if (config.customConfig?.args) {
      try {
        if (typeof config.customConfig.args === 'string') {
          const parsed = JSON.parse(config.customConfig.args);
          if (!Array.isArray(parsed)) {
            errors.push('Arguments configuration must resolve to an Array');
          }
        }
      } catch {
        errors.push('Arguments configuration contains invalid JSON');
      }
    }

    return errors;
  }

  override getDefaults(): Partial<StellarTemplateConfig> {
    return {
      fee: DEFAULT_FEE,
      timeout: DEFAULT_TIMEOUT,
      network: 'testnet',
      customConfig: {
        functionName: 'hello',
        args: '[]',
        simulated: true,
      },
    };
  }
}
