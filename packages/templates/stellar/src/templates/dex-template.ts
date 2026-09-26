import {
  StellarTemplate,
  StellarTemplateConfig,
  DexOperation,
  TemplateVariable,
} from '../types';
import {
  NETWORK_PRESETS,
  DEFAULT_FEE,
  DEFAULT_TIMEOUT,
  TEMPLATE_VARIABLES,
  STELLAR_TEMPLATE_META,
} from '../config/default-config';

export class DexTemplate implements StellarTemplate {
  readonly id = STELLAR_TEMPLATE_META.dex.id;
  readonly name = STELLAR_TEMPLATE_META.dex.name;
  readonly description = STELLAR_TEMPLATE_META.dex.description;
  readonly type = 'dex' as const;
  readonly version = STELLAR_TEMPLATE_META.dex.version;
  readonly variables: TemplateVariable[] = TEMPLATE_VARIABLES.dex;

  generate(config: StellarTemplateConfig): DexOperation {
    const sellAmount = config.customConfig?.sellAmount as string;
    const slippage = (config.customConfig?.slippage as number) || 0.5;
    const sellAmountNum = parseFloat(sellAmount);
    const minBuy = (sellAmountNum * (1 - slippage / 100)).toString();

    return {
      sellAsset: config.customConfig?.sellAsset as string,
      buyAsset: config.customConfig?.buyAsset as string,
      sellAmount,
      minBuyAmount: minBuy,
      timeout: config.timeout || DEFAULT_TIMEOUT,
    };
  }

  validate(config: StellarTemplateConfig): string[] {
    const errors: string[] = [];

    if (!config.customConfig?.sellAsset) {
      errors.push('Sell asset is required');
    }
    if (!config.customConfig?.buyAsset) {
      errors.push('Buy asset is required');
    }

    const amount = config.customConfig?.sellAmount as string;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      errors.push('Sell amount must be a positive number');
    }

    return errors;
  }

  getDefaults(): Partial<StellarTemplateConfig> {
    return {
      fee: DEFAULT_FEE,
      timeout: DEFAULT_TIMEOUT,
      network: 'testnet',
      customConfig: { slippage: 0.5 },
    };
  }
}
