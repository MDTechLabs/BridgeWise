import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagGuard } from './feature-flag.guard';

/**
 * Feature Flags Module
 *
 * Provides:
 *  - FeatureFlagsService  — check flag state from any service/guard/controller
 *  - FeatureFlagGuard     — route-level guard triggered by @RequireFeature()
 *  - GET /feature-flags   — list all flags
 *  - GET /feature-flags/:flag — get a single flag state
 *
 * Import this module wherever feature-flag checks are needed, or add it to
 * AppModule for global availability.
 */
@Module({
  imports: [ConfigModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
