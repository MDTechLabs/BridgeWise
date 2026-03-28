import { SetMetadata } from '@nestjs/common';
import { AppConfig } from '../config/config-factory';

export const FEATURE_FLAG_KEY = 'featureFlag';

/**
 * Marks a controller or route handler as requiring a specific feature flag.
 * When the flag is disabled the request returns 403 Forbidden.
 *
 * @example
 * @RequireFeature('enableBridgeCompare')
 * @Get()
 * getBridgeRoutes() { ... }
 */
export const RequireFeature = (
  flag: keyof AppConfig['features'],
): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEY, flag);
