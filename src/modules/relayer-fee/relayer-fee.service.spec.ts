import { Test, TestingModule } from '@nestjs/testing';
import { RelayerFeeService } from './relayer-fee.service';

describe('RelayerFeeService', () => {
  let service: RelayerFeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelayerFeeService],
    }).compile();

    service = module.get<RelayerFeeService>(RelayerFeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate correct fee for tier 1 volume (< $1000)', () => {
    const fee = service.calculateFee({ assetId: 'USDC', volumeUsd: 500 });
    // Base 0.5 + (500 * 0.001 = 0.5) = 1.0
    expect(fee).toBe(1.0);
  });

  it('should calculate correct fee for tier 2 volume (>= $1000)', () => {
    const fee = service.calculateFee({ assetId: 'USDC', volumeUsd: 2000 });
    // Base 0.5 + (2000 * 0.0005 = 1.0) = 1.5
    expect(fee).toBe(1.5);
  });
});
