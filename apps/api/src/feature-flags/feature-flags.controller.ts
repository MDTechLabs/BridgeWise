import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeatureFlagName, FeatureFlagsService } from './feature-flags.service';

@ApiTags('Feature Flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * Returns all feature flags and their current state.
   * Useful for frontend consumers that need to adapt their UI based on
   * which features are active in the current deployment.
   */
  @Get()
  @ApiOperation({ summary: 'List all feature flags and their current state' })
  @ApiResponse({
    status: 200,
    description: 'Map of feature flag names to their boolean enabled state',
  })
  getAll() {
    return this.featureFlagsService.getAll();
  }

  /**
   * Returns the enabled/disabled state of a single feature flag.
   */
  @Get(':flag')
  @ApiOperation({ summary: 'Get a single feature flag by name' })
  @ApiParam({
    name: 'flag',
    description: 'Feature flag name (camelCase)',
    example: 'enableBridgeCompare',
  })
  @ApiResponse({ status: 200, description: 'Flag state' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  getOne(@Param('flag') flag: string) {
    const all = this.featureFlagsService.getAll();

    if (!(flag in all)) {
      throw new NotFoundException(`Feature flag '${flag}' does not exist.`);
    }

    return {
      flag,
      enabled: this.featureFlagsService.isEnabled(flag as FeatureFlagName),
    };
  }
}
