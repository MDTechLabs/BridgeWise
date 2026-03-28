import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

const allFlags = {
  enableAnalytics: true,
  enableBenchmarking: false,
  enableBridgeCompare: true,
  enableGasEstimation: true,
  enableRealTimeFees: true,
  enableBridgeDiscovery: true,
  enableReliabilityScore: true,
};

const mockFeatureFlagsService = {
  getAll: jest.fn().mockReturnValue(allFlags),
  isEnabled: jest.fn((flag: string) => allFlags[flag as keyof typeof allFlags] ?? false),
};

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureFlagsController],
      providers: [
        { provide: FeatureFlagsService, useValue: mockFeatureFlagsService },
      ],
    }).compile();

    controller = module.get<FeatureFlagsController>(FeatureFlagsController);
    jest.clearAllMocks();
    mockFeatureFlagsService.getAll.mockReturnValue(allFlags);
    mockFeatureFlagsService.isEnabled.mockImplementation(
      (flag: string) => allFlags[flag as keyof typeof allFlags] ?? false,
    );
  });

  describe('getAll', () => {
    it('returns all feature flags', () => {
      const result = controller.getAll();

      expect(result).toEqual(allFlags);
      expect(mockFeatureFlagsService.getAll).toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('returns flag state for a known flag', () => {
      const result = controller.getOne('enableBridgeCompare');

      expect(result).toEqual({ flag: 'enableBridgeCompare', enabled: true });
    });

    it('returns false for a disabled flag', () => {
      const result = controller.getOne('enableBenchmarking');

      expect(result).toEqual({ flag: 'enableBenchmarking', enabled: false });
    });

    it('throws NotFoundException for an unknown flag name', () => {
      expect(() => controller.getOne('nonExistentFlag')).toThrow(
        NotFoundException,
      );
    });
  });
});
