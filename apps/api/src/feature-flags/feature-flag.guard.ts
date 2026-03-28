import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfig } from '../config/config-factory';
import { FEATURE_FLAG_KEY } from './require-feature.decorator';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * Guard that blocks access to a route when its required feature flag is disabled.
 *
 * Register globally or per-module:
 *   providers: [{ provide: APP_GUARD, useClass: FeatureFlagGuard }]
 *
 * Or apply directly on a controller / handler:
 *   @UseGuards(FeatureFlagGuard)
 *   @RequireFeature('enableBridgeCompare')
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<
      keyof AppConfig['features'] | undefined
    >(FEATURE_FLAG_KEY, [context.getHandler(), context.getClass()]);

    // No @RequireFeature annotation — allow through
    if (!flag) return true;

    if (!this.featureFlagsService.isEnabled(flag)) {
      throw new ForbiddenException(
        `Feature '${flag}' is currently disabled in this environment.`,
      );
    }

    return true;
  }
}
