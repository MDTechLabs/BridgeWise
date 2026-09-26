export { StellarBridgeLiquidityMonitoringService } from './liquidity-monitoring.service';
export type {
  LiquidityDataPoint,
  LiquidityChangeEvent,
  LiquidityChangeDirection,
  LiquidityMonitoringConfig,
  LiquidityAlertThreshold,
  LiquidityAlert,
  LiquidityAlertSeverity,
  LiquidityReport,
  LiquidityAssetReport,
  LiquiditySummary,
  LiquidityDataCollector,
  LiquidityProviderRegistration,
} from './types';

import { StellarBridgeLiquidityMonitoringService } from './liquidity-monitoring.service';

/** Pre-configured monitoring service instance. */
export const stellarBridgeLiquidityMonitoringService =
  new StellarBridgeLiquidityMonitoringService();
