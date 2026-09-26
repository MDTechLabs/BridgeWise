import { TimelockExecutionService } from './timelock-execution.service';

describe('TimelockExecutionService', () => {
  let service: TimelockExecutionService;

  beforeEach(() => {
    service = new TimelockExecutionService({
      minDelayMs: 3600000, // 1h for testing
      maxDelayMs: 86400000, // 24h
      gracePeriodMs: 7200000, // 2h
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should queue an operation with a valid delay', () => {
    const result = service.queueOperation(
      'UPGRADE',
      '0xBridgeRouter',
      { implementation: '0xNewImpl' },
      '0xAdmin',
      3600000
    );

    expect(result.success).toBe(true);
    expect(result.operationId).toBeDefined();

    const op = service.getOperation(result.operationId!);
    expect(op?.status).toBe('QUEUED');
    expect(op?.target).toBe('0xBridgeRouter');
  });

  it('should reject operations with delay less than minDelay', () => {
    const result = service.queueOperation(
      'PARAMETER_CHANGE',
      '0xFeeVault',
      { fee: 10 },
      '0xAdmin',
      1800000 // 30m < 1h
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('less than minimum required delay');
  });

  it('should reject execution before timelock delay elapses', () => {
    const queueRes = service.queueOperation(
      'TREASURY',
      '0xTreasury',
      { amount: 1000 },
      '0xAdmin',
      3600000
    );
    const opId = queueRes.operationId!;

    // Advance timer by only 30 minutes
    jest.advanceTimersByTime(1800000);

    const execRes = service.executeOperation(opId, '0xExecutor');
    expect(execRes.success).toBe(false);
    expect(execRes.error).toContain('Timelock delay not elapsed');
  });

  it('should allow execution once delay has elapsed', () => {
    const queueRes = service.queueOperation(
      'ALLOWLIST',
      '0xAllowlistRegistry',
      { addAsset: 'USDC' },
      '0xAdmin',
      3600000
    );
    const opId = queueRes.operationId!;

    // Advance timer past 1h
    jest.advanceTimersByTime(3600001);

    const execRes = service.executeOperation(opId, '0xExecutor');
    expect(execRes.success).toBe(true);

    const op = service.getOperation(opId);
    expect(op?.status).toBe('EXECUTED');
  });

  it('should allow authorized cancellation before execution', () => {
    const queueRes = service.queueOperation(
      'UPGRADE',
      '0xBridgeRouter',
      { implementation: '0xBadImpl' },
      '0xAdmin',
      3600000
    );
    const opId = queueRes.operationId!;

    const cancelRes = service.cancelOperation(opId, '0xGuardian');
    expect(cancelRes.success).toBe(true);

    const op = service.getOperation(opId);
    expect(op?.status).toBe('CANCELLED');

    // Try executing cancelled operation
    jest.advanceTimersByTime(4000000);
    const execRes = service.executeOperation(opId, '0xExecutor');
    expect(execRes.success).toBe(false);
    expect(execRes.error).toContain('cancelled');
  });

  it('should expire operations past their grace period', () => {
    const queueRes = service.queueOperation(
      'PARAMETER_CHANGE',
      '0xBridgeConfig',
      { param: 'xyz' },
      '0xAdmin',
      3600000 // 1h delay
    );
    const opId = queueRes.operationId!;

    // Advance past 1h delay + 2h grace period (3h 1ms total)
    jest.advanceTimersByTime(10800001);

    const op = service.getOperation(opId);
    expect(op?.status).toBe('EXPIRED');

    const execRes = service.executeOperation(opId, '0xExecutor');
    expect(execRes.success).toBe(false);
    expect(execRes.error).toContain('expired');
  });
});
