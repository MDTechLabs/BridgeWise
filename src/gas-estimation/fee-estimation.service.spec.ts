import { Test, TestingModule } from '@nestjs/testing';
import { FeeEstimationService } from './fee-estimation.service';
import { StellarAdapter } from './adapters/stellar.adapter';
import { LayerZeroAdapter } from './adapters/layerzero.adapter';
import { HopAdapter } from './adapters/hop.adapter';
import { TokenService } from './token.service';
import { NetworkType } from './interfaces/fee.interface';

describe('FeeEstimationService', () => {
  let service: FeeEstimationService;
  let stellarAdapter: StellarAdapter;
  let layerZeroAdapter: LayerZeroAdapter;
  let hopAdapter: HopAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEstimationService,
        TokenService,
        {
          provide: StellarAdapter,
          useValue: {
            getFees: jest.fn(),
          },
        },
        {
          provide: LayerZeroAdapter,
          useValue: {
            getFees: jest.fn(),
          },
        },
        {
          provide: HopAdapter,
          useValue: {
            getFees: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FeeEstimationService>(FeeEstimationService);
    stellarAdapter = module.get<StellarAdapter>(StellarAdapter);
    layerZeroAdapter = module.get<LayerZeroAdapter>(LayerZeroAdapter);
    hopAdapter = module.get<HopAdapter>(HopAdapter);
  });

  describe('getAllFeeEstimates', () => {
    it('should return normalized fee data for all networks', async () => {
      // Mock adapter responses
      jest.spyOn(stellarAdapter, 'getFees').mockResolvedValue({
        min: '100',
        mode: '200',
        p90: '300',
        decimals: 7,
        symbol: 'XLM',
        p10: '100',
        p20: '150',
        p30: '175',
        p40: '190',
        p50: '200',
        p60: '220',
        p70: '250',
        p80: '280',
        p95: '320',
        p99: '400',
      });

      jest.spyOn(layerZeroAdapter, 'getFees').mockResolvedValue({
        baseFee: '100000000000000',
        standardFee: '150000000000000',
        priorityFee: '200000000000000',
        decimals: 18,
        symbol: 'ETH',
        sourceChain: 'ethereum',
        destinationChain: 'arbitrum',
      });

      jest.spyOn(hopAdapter, 'getFees').mockResolvedValue({
        lpFee: '400',
        bonderFee: '200',
        destinationTxFee: '1000',
        decimals: 6,
        symbol: 'USDC',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'arbitrum',
      });

      const result = await service.getAllFeeEstimates();

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('networks');
      expect(result).toHaveProperty('metadata');
      expect(result.networks.stellar.available).toBe(true);
      expect(result.networks.layerzero.available).toBe(true);
      expect(result.networks.hop.available).toBe(true);
      expect(result.metadata.successfulProviders).toBe(3);
    });

    it('should handle adapter failures gracefully', async () => {
      jest.spyOn(stellarAdapter, 'getFees').mockRejectedValue(
        new Error('Network error'),
      );

      jest.spyOn(layerZeroAdapter, 'getFees').mockResolvedValue({
        baseFee: '100000000000000',
        standardFee: '150000000000000',
        priorityFee: '200000000000000',
        decimals: 18,
        symbol: 'ETH',
        sourceChain: 'ethereum',
        destinationChain: 'arbitrum',
      });

      jest.spyOn(hopAdapter, 'getFees').mockResolvedValue({
        lpFee: '400',
        bonderFee: '200',
        destinationTxFee: '1000',
        decimals: 6,
        symbol: 'USDC',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'arbitrum',
      });

      const result = await service.getAllFeeEstimates();

      expect(result.networks.stellar.available).toBe(false);
      expect(result.networks.stellar.error).toBeDefined();
      expect(result.networks.layerzero.available).toBe(true);
      expect(result.networks.hop.available).toBe(true);
      expect(result.metadata.successfulProviders).toBe(2);
    });
  });

  describe('getFeeEstimate', () => {
    it('should return fees for a specific network', async () => {
      jest.spyOn(stellarAdapter, 'getFees').mockResolvedValue({
        min: '100',
        mode: '200',
        p90: '300',
        decimals: 7,
        symbol: 'XLM',
        p10: '100',
        p20: '150',
        p30: '175',
        p40: '190',
        p50: '200',
        p60: '220',
        p70: '250',
        p80: '280',
        p95: '320',
        p99: '400',
      });

      const result = await service.getFeeEstimate(NetworkType.STELLAR);

      expect(result.network).toBe(NetworkType.STELLAR);
      expect(result.available).toBe(true);
      expect(result.fees).toHaveProperty('slow');
      expect(result.fees).toHaveProperty('standard');
      expect(result.fees).toHaveProperty('fast');
    });

    it('should handle individual adapter failure', async () => {
      jest.spyOn(stellarAdapter, 'getFees').mockRejectedValue(
        new Error('API unavailable'),
      );

      const result = await service.getFeeEstimate(NetworkType.STELLAR);

      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.fees.slow).toBe('0');
    });
  });
});

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('normalizeAmount', () => {
    it('should normalize amount with correct decimals', () => {
      const result = service.normalizeAmount('1000000', 6, 'USDC');
      expect(result).toBe('1.00');
    });

    it('should handle very small amounts', () => {
      const result = service.normalizeAmount('100', 18, 'ETH');
      expect(parseFloat(result)).toBeLessThan(0.000001);
    });

    it('should handle large decimals', () => {
      const result = service.normalizeAmount('1000000000000000000', 18, 'ETH');
      expect(result).toBe('1.00');
    });
  });

  describe('denormalizeAmount', () => {
    it('should convert normalized amount back to raw units', () => {
      const result = service.denormalizeAmount('1.5', 6);
      expect(result).toBe('1500000');
    });
  });

  describe('convertDecimals', () => {
    it('should convert between different decimal places', () => {
      const result = service.convertDecimals('1000000', 6, 18);
      expect(result).toBe('1000000000000000000');
    });
  });
});