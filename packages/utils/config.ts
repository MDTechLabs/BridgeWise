interface SlippageConfig {
  [token: string]: number;
}

const slippageConfig: SlippageConfig = {
  USDC: 0.5,
  ETH: 1.0,
  STX: 0.8,
};

export const getSlippageThreshold = (token: string): number => {
  return slippageConfig[token] || 1.0; // Default to 1.0% if token not configured
};