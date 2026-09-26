export type {
  NetworkPreset,
  StellarTemplateType,
  StellarNetworkConfig,
  StellarTemplateConfig,
  TemplateVariable,
  StellarTemplate,
  TemplateResult,
  PaymentOperation,
  DexOperation,
  NftOperation,
} from './types';

export {
  NETWORK_PRESETS,
  DEFAULT_FEE,
  DEFAULT_TIMEOUT,
  DEFAULT_BASE_RESERVE,
  DEFAULT_NETWORK,
  TEMPLATE_VARIABLES,
  STELLAR_TEMPLATE_META,
} from './config';

export {
  BaseStellarTemplate,
  PaymentTemplate,
  DexTemplate,
  NftTemplate,
  SorobanTemplate,
} from './templates';

export const STELLAR_TEMPLATES_VERSION = '0.1.0';
