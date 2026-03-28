import { FeatureFlagsService } from './feature-flags.service';
import { EnvironmentConfigService } from '../config/environment-config.service';

const makeConfigService = (
  overrides: Partial<ReturnType<EnvironmentConfigService['getFeatures']>> = {},
) => {
  const defaults = {
    enableAnalytics: true,
    enableBenchmarking: false,
    enableBridgeCompare: true,
    enableGasEstimation: true,
    enableRealTimeFees: true,
    enableBridgeDiscovery: true,
    enableReliabilityScore: true,
    ...overrides,
  };

  return {
    getFeatures: jest.fn().mockReturnValue(defaults),
    isFeatureEnabled: jest.fn(
      (flag: keyof typeof defaults) => defaults[flag],
    ),
  } as unknown as EnvironmentConfigService;
};

describe('FeatureFlagsService', () => {
  describe('getAll', () => {
    it('returns all flags from config service', () => {
      const service = new FeatureFlagsService(makeConfigService());
      const flags = service.getAll();

      expect(flags.enableAnalytics).toBe(true);
      expect(flags.enableBenchmarking).toBe(false);
      expect(flags.enableBridgeCompare).toBe(true);
      expect(flags.enableGasEstimation).toBe(true);
      expect(flags.enableRealTimeFees).toBe(true);
      expect(flags.enableBridgeDiscovery).toBe(true);
      expect(flags.enableReliabilityScore).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('returns true when flag is enabled', () => {
      const service = new FeatureFlagsService(
        makeConfigService({ enableBridgeCompare: true }),
      );
      expect(service.isEnabled('enableBridgeCompare')).toBe(true);
    });

    it('returns false when flag is disabled', () => {
      const service = new FeatureFlagsService(
        makeConfigService({ enableBenchmarking: false }),
      );
      expect(service.isEnabled('enableBenchmarking')).toBe(false);
    });
  });

  describe('isDisabled', () => {
    it('returns true when flag is disabled', () => {
      const service = new FeatureFlagsService(
        makeConfigService({ enableBenchmarking: false }),
      );
      expect(service.isDisabled('enableBenchmarking')).toBe(true);
    });

    it('returns false when flag is enabled', () => {
      const service = new FeatureFlagsService(
        makeConfigService({ enableBridgeCompare: true }),
      );
      expect(service.isDisabled('enableBridgeCompare')).toBe(false);
    });
  });
});
