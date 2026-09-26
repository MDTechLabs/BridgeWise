import { ExposureLimitService, TransferRequest } from './exposure-limit.service';

describe('ExposureLimitService', () => {
  let service: ExposureLimitService;

  beforeEach(() => {
    service = new ExposureLimitService({
      perTransactionLimitUsd: 100000, // $100k max single tx
      defaultPerAssetDailyLimitUsd: 500000, // $500k default daily asset cap
      aggregateProtocolExposureLimitUsd: 1000000, // $1M aggregate limit
      perAssetDailyLimitUsd: {
        USDC: 800000,
      },
    });
  });

  it('should allow valid transfers within all limits', () => {
    const transfer: TransferRequest = {
      transferId: 'tx-1',
      asset: 'USDC',
      amountUsd: 50000,
      sender: '0x123',
    };

    const result = service.recordTransfer(transfer);
    expect(result.allowed).toBe(true);
    expect(service.getCurrentExposure().aggregateActiveExposureUsd).toBe(50000);
    expect(service.getCurrentExposure().activeTransfersCount).toBe(1);
  });

  it('should reject transfers exceeding per-transaction limit', () => {
    const transfer: TransferRequest = {
      transferId: 'tx-2',
      asset: 'USDC',
      amountUsd: 150000, // Exceeds $100k per-tx limit
    };

    const result = service.recordTransfer(transfer);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('EXCEEDS_PER_TX_LIMIT');
    expect(result.reason).toContain('exceeds maximum per-transaction limit');
    expect(service.getCurrentExposure().activeTransfersCount).toBe(0);
  });

  it('should enforce specific asset daily limits', () => {
    // USDC has limit of $800k
    service.recordTransfer({ transferId: 'tx-1', asset: 'USDC', amountUsd: 90000 });
    service.recordTransfer({ transferId: 'tx-2', asset: 'USDC', amountUsd: 90000 });

    // Try a large cumulative transfer exceeding $800k
    service.setPerTransactionLimit(900000);
    const result = service.recordTransfer({ transferId: 'tx-3', asset: 'USDC', amountUsd: 700000 });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('EXCEEDS_ASSET_DAILY_LIMIT');
  });

  it('should enforce aggregate protocol exposure limits', () => {
    service.setPerTransactionLimit(600000);
    
    // Transfer 1: $600k
    service.recordTransfer({ transferId: 'tx-1', asset: 'USDT', amountUsd: 500000 });
    
    // Transfer 2: $600k (Total $1.1M > $1M aggregate limit)
    const result = service.recordTransfer({ transferId: 'tx-2', asset: 'USDC', amountUsd: 600000 });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('EXCEEDS_AGGREGATE_EXPOSURE_LIMIT');
  });

  it('should release active transfer exposure when completed', () => {
    service.recordTransfer({ transferId: 'tx-1', asset: 'ETH', amountUsd: 40000 });
    expect(service.getCurrentExposure().aggregateActiveExposureUsd).toBe(40000);

    const released = service.releaseTransfer('tx-1');
    expect(released).toBe(true);
    expect(service.getCurrentExposure().aggregateActiveExposureUsd).toBe(0);
  });

  it('should reset daily limits on demand', () => {
    service.recordTransfer({ transferId: 'tx-1', asset: 'USDC', amountUsd: 50000 });
    expect(service.getCurrentExposure().dailyAssetVolumeUsd['USDC']).toBe(50000);

    service.resetDailyLimits();
    expect(service.getCurrentExposure().dailyAssetVolumeUsd['USDC']).toBeUndefined();
  });
});
