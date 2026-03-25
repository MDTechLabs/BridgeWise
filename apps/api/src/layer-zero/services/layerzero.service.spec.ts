import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LayerZeroService } from './layerzero.service';
import { LayerZeroChainId } from '../types/layerzero.type';

describe('LayerZeroService Unit Tests', () => {
  let service: LayerZeroService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LayerZeroService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                LAYERZERO_ENDPOINT: 'https://api.layerzero.com',
                LAYERZERO_TIMEOUT: 30000,
                LAYERZERO_MAX_RETRIES: 3,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LayerZeroService>(LayerZeroService);
    configService = module.get<ConfigService>(ConfigService);

    // Disable automatic health checks for unit tests
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('estimateFees', () => {
    it('should calculate fees based on chain pair and payload', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const payload = '0x123456';
      const feeEstimate = await service.estimateFees(route, payload);

      expect(feeEstimate).toBeDefined();
      expect(feeEstimate.nativeFee).toBeDefined();
      expect(BigInt(feeEstimate.nativeFee)).toBeGreaterThan(0n);
      expect(feeEstimate.zroFee).toBe('0');
      expect(feeEstimate.totalFeeUsd).toBeGreaterThan(0);
    });

    it('should increase fees with larger payloads', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const smallPayload = '0x12';
      const largePayload = '0x' + '12'.repeat(500);

      const smallFee = await service.estimateFees(route, smallPayload);
      const largeFee = await service.estimateFees(route, largePayload);

      expect(BigInt(largeFee.nativeFee)).toBeGreaterThan(BigInt(smallFee.nativeFee));
    });

    it('should use default base fee for unknown chain pairs', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.FANTOM,
        destinationChainId: LayerZeroChainId.AVALANCHE,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const feeEstimate = await service.estimateFees(route, '0x1234');

      expect(feeEstimate.nativeFee).toBeDefined();
      expect(BigInt(feeEstimate.nativeFee)).toBeGreaterThan(0n);
    });
  });

  describe('estimateLatency', () => {
    it('should estimate latency based on chain finality times', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const latencyEstimate = await service.estimateLatency(route);

      expect(latencyEstimate.estimatedSeconds).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(latencyEstimate.confidence);
      expect(latencyEstimate.lastUpdated).toBeInstanceOf(Date);
    });

    it('should have high confidence for Ethereum routes', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.ARBITRUM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const latencyEstimate = await service.estimateLatency(route);

      expect(latencyEstimate.confidence).toBe('high');
    });

    it('should cache latency estimates', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.POLYGON,
        destinationChainId: LayerZeroChainId.ETHEREUM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const estimate1 = await service.estimateLatency(route);
      const estimate2 = await service.estimateLatency(route);

      expect(estimate1.lastUpdated.getTime()).toBe(estimate2.lastUpdated.getTime());
    });
  });

  describe('getBridgeEstimate', () => {
    it('should return combined fee and latency estimates', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ARBITRUM,
        destinationChainId: LayerZeroChainId.OPTIMISM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const payload = '0xabcdef';
      const estimate = await service.getBridgeEstimate(route, payload);

      expect(estimate.fee).toBeDefined();
      expect(estimate.latency).toBeDefined();
      expect(estimate.route).toEqual(route);

      expect(estimate.fee.nativeFee).toBeDefined();
      expect(estimate.latency.estimatedSeconds).toBeGreaterThan(0);
    });
  });

  describe('checkHealth', () => {
    it('should check endpoint health and return status', async () => {
      const chainId = LayerZeroChainId.ETHEREUM;
      const healthStatus = await service.checkHealth(chainId);

      expect(healthStatus.chainId).toBe(chainId);
      expect(typeof healthStatus.isHealthy).toBe('boolean');
      expect(healthStatus.endpoint).toBeDefined();
      expect(healthStatus.latency).toBeGreaterThanOrEqual(0);
      expect(healthStatus.lastChecked).toBeInstanceOf(Date);
    });

    it('should mark as unhealthy if latency is too high', async () => {
      // Mock pingEndpoint to simulate high latency
      const originalPing = service['pingEndpoint'];
      service['pingEndpoint'] = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 6000));
      });

      const healthStatus = await service.checkHealth(LayerZeroChainId.POLYGON);

      expect(healthStatus.isHealthy).toBe(false);
      expect(healthStatus.errors).toBeDefined();
      expect(healthStatus.errors?.length).toBeGreaterThan(0);

      service['pingEndpoint'] = originalPing;
    }, 10000); // 10 second timeout to accommodate the 6 second delay

    it('should handle endpoint errors gracefully', async () => {
      // Mock pingEndpoint to throw error
      const originalPing = service['pingEndpoint'];
      service['pingEndpoint'] = jest.fn().mockRejectedValue(new Error('Network error'));

      const healthStatus = await service.checkHealth(LayerZeroChainId.BSC);

      expect(healthStatus.isHealthy).toBe(false);
      expect(healthStatus.errors).toContain('Network error');

      service['pingEndpoint'] = originalPing;
    });

    it('should cache health status', async () => {
      const chainId = LayerZeroChainId.AVALANCHE;
      
      await service.checkHealth(chainId);
      const cachedStatus = service.getHealthStatus(chainId);

      expect(cachedStatus).toBeDefined();
      expect((cachedStatus as any).chainId).toBe(chainId);
    });
  });

  describe('checkAllHealth', () => {
    it('should check health for all supported chains', async () => {
      const allHealthStatuses = await service.checkAllHealth();

      expect(Array.isArray(allHealthStatuses)).toBe(true);
      expect(allHealthStatuses.length).toBe(7); // All LayerZero chains

      allHealthStatuses.forEach(status => {
        expect(status.chainId).toBeDefined();
        expect(typeof status.isHealthy).toBe('boolean');
        expect(status.endpoint).toBeDefined();
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return cached status for specific chain', async () => {
      const chainId = LayerZeroChainId.FANTOM;
      
      await service.checkHealth(chainId);
      const status = service.getHealthStatus(chainId);

      expect(status).toBeDefined();
      expect((status as any).chainId).toBe(chainId);
    });

    it('should return all cached statuses when no chain specified', async () => {
      await service.checkAllHealth();
      const allStatuses = service.getHealthStatus();

      expect(Array.isArray(allStatuses)).toBe(true);
      expect((allStatuses as any[]).length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty payload', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const feeEstimate = await service.estimateFees(route, '0x');

      expect(feeEstimate.nativeFee).toBeDefined();
      expect(BigInt(feeEstimate.nativeFee)).toBeGreaterThan(0n);
    });

    it('should handle very large payloads', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const largePayload = '0x' + 'ff'.repeat(10000);
      const feeEstimate = await service.estimateFees(route, largePayload);

      expect(feeEstimate.nativeFee).toBeDefined();
      expect(BigInt(feeEstimate.nativeFee)).toBeGreaterThan(0n);
    });
  });
});