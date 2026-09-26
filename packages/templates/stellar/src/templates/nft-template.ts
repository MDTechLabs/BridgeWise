import {
  StellarTemplate,
  StellarTemplateConfig,
  NftOperation,
  TemplateVariable,
} from '../types';
import {
  NETWORK_PRESETS,
  DEFAULT_FEE,
  DEFAULT_TIMEOUT,
  TEMPLATE_VARIABLES,
  STELLAR_TEMPLATE_META,
} from '../config/default-config';

export class NftTemplate implements StellarTemplate {
  readonly id = STELLAR_TEMPLATE_META.nft.id;
  readonly name = STELLAR_TEMPLATE_META.nft.name;
  readonly description = STELLAR_TEMPLATE_META.nft.description;
  readonly type = 'nft' as const;
  readonly version = STELLAR_TEMPLATE_META.nft.version;
  readonly variables: TemplateVariable[] = TEMPLATE_VARIABLES.nft;

  generate(config: StellarTemplateConfig): NftOperation {
    const action = config.customConfig?.action as string;

    const base: NftOperation = {
      contractId: config.customConfig?.contractId as string,
    };

    if (action === 'transfer') {
      base.from = config.customConfig?.from as string;
      base.to = config.customConfig?.to as string;
      base.tokenId = config.customConfig?.tokenId as string;
    } else if (action === 'mint') {
      base.to = config.customConfig?.to as string;
    } else if (action === 'balance') {
      base.operator = config.customConfig?.operator as string;
      base.tokenId = config.customConfig?.tokenId as string;
    } else if (action === 'burn') {
      base.tokenId = config.customConfig?.tokenId as string;
    }

    return base;
  }

  validate(config: StellarTemplateConfig): string[] {
    const errors: string[] = [];
    const contractId = config.customConfig?.contractId as string;

    if (!contractId) {
      errors.push('Contract ID is required');
    } else if (!contractId.startsWith('C') || contractId.length !== 56) {
      errors.push('Invalid Soroban contract ID format');
    }

    const action = config.customConfig?.action as string;
    if (!action) {
      errors.push('Action is required (mint, transfer, burn, balance)');
    }

    return errors;
  }

  getDefaults(): Partial<StellarTemplateConfig> {
    return {
      fee: DEFAULT_FEE,
      timeout: DEFAULT_TIMEOUT,
      network: 'testnet',
      customConfig: { action: 'balance' },
    };
  }
}
