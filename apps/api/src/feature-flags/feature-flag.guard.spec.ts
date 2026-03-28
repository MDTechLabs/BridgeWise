import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAG_KEY } from './require-feature.decorator';

const makeContext = () =>
  ({
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
  }) as unknown as ExecutionContext;

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let reflector: Reflector;
  let featureFlagsService: Partial<FeatureFlagsService>;

  beforeEach(() => {
    reflector = new Reflector();
    featureFlagsService = { isEnabled: jest.fn() };
    guard = new FeatureFlagGuard(
      reflector,
      featureFlagsService as FeatureFlagsService,
    );
  });

  it('allows access when no @RequireFeature decorator is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows access when the required feature flag is enabled', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('enableBridgeCompare');
    (featureFlagsService.isEnabled as jest.Mock).mockReturnValue(true);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('throws ForbiddenException when the required feature flag is disabled', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('enableBridgeCompare');
    (featureFlagsService.isEnabled as jest.Mock).mockReturnValue(false);

    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });

  it('uses FEATURE_FLAG_KEY to look up metadata', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const ctx = makeContext();

    guard.canActivate(ctx);

    expect(spy).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });
});
