import { Test, TestingModule } from '@nestjs/testing';
import { FeeEstimatorService } from './fee-estimator.service';
import { GasPriceAdapter } from '../fee-estimation/adapters/gas-price.adapter';

describe('FeeEstimatorService', () => {
  let service: FeeEstimatorService;
  let gasPriceAdapter: GasPriceAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEstimatorService,
        {
          provide: GasPriceAdapter,
          useValue: {
            getGasPrice: jest.fn().mockResolvedValue({ gasPriceGwei: 30 }),
            calculateGasFee: jest
              .fn()
              .mockImplementation(
                (_chain: string, gasPriceGwei: number, gasLimit: number) =>
                  (gasPriceGwei * gasLimit) / 1e9,
              ),
          },
        },
      ],
    }).compile();

    service = module.get<FeeEstimatorService>(FeeEstimatorService);
    gasPriceAdapter = module.get<GasPriceAdapter>(GasPriceAdapter);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('estimates an EVM target chain fee using the gas price adapter', async () => {
    const result = await service.estimateFee({
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      payloadByteLength: 256,
    });

    expect(gasPriceAdapter.getGasPrice).toHaveBeenCalledWith('ethereum');
    expect(result.nativeTokenSymbol).toBe('ETH');
    expect(Number(result.totalFeeNative)).toBeGreaterThan(0);
    expect(Number(result.totalFeeUsd)).toBeGreaterThan(0);
    expect(result.estimatedGasUnits).toBeGreaterThan(0);
  });

  it('estimates a Stellar target chain fee using the flat resource fee model', async () => {
    const result = await service.estimateFee({
      sourceChain: 'ethereum',
      targetChain: 'stellar',
      payloadByteLength: 100,
    });

    expect(gasPriceAdapter.getGasPrice).not.toHaveBeenCalled();
    expect(result.nativeTokenSymbol).toBe('XLM');
    expect(Number(result.totalFeeNative)).toBeGreaterThan(0);
  });

  it('applies a larger payload as a higher fee', async () => {
    const small = await service.estimateFee({
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      payloadByteLength: 32,
    });
    const large = await service.estimateFee({
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      payloadByteLength: 4096,
    });

    expect(large.estimatedGasUnits).toBeGreaterThan(small.estimatedGasUnits);
    expect(Number(large.totalFeeNative)).toBeGreaterThan(Number(small.totalFeeNative));
  });
});
