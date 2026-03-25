import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BridgeReliabilityService } from './bridge-reliability.service';
import { ReliabilityCalculatorService } from './reliability-calculator.service';
import { BridgeTransactionEvent } from './bridge-transaction-event.entity';
import { BridgeReliabilityMetric } from './bridge-reliability-metric.entity';
import { TransactionOutcome, WindowMode, ReliabilityTier } from './reliability.enum';
import { RecordBridgeEventDto, GetReliabilityDto } from './reliability.dto';

// ─── Mock Factory ──────────────────────────────────────────────────────────────

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepo = <T>(): MockRepo<T> => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

const makeEvent = (outcome: TransactionOutcome): Partial<BridgeTransactionEvent> => ({
  outcome,
  createdAt: new Date(),
});

const makeEvents = (
  successCount: number,
  failCount: number,
  timeoutCount: number,
  cancelledCount = 0,
): Partial<BridgeTransactionEvent>[] => [
  ...Array(successCount).fill(makeEvent(TransactionOutcome.SUCCESS)),
  ...Array(failCount).fill(makeEvent(TransactionOutcome.FAILED)),
  ...Array(timeoutCount).fill(makeEvent(TransactionOutcome.TIMEOUT)),
  ...Array(cancelledCount).fill(makeEvent(TransactionOutcome.CANCELLED)),
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BridgeReliabilityService', () => {
  let service: BridgeReliabilityService;
  let eventRepo: MockRepo<BridgeTransactionEvent>;
  let metricRepo: MockRepo<BridgeReliabilityMetric>;

  const baseRoute = {
    bridgeName: 'Stargate',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
  };

  beforeEach(async () => {
    eventRepo = createMockRepo<BridgeTransactionEvent>();
    metricRepo = createMockRepo<BridgeReliabilityMetric>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeReliabilityService,
        ReliabilityCalculatorService,
        {
          provide: getRepositoryToken(BridgeTransactionEvent),
          useValue: eventRepo,
        },
        {
          provide: getRepositoryToken(BridgeReliabilityMetric),
          useValue: metricRepo,
        },
      ],
    }).compile();

    service = module.get(BridgeReliabilityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── recordEvent ──────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    const dto: RecordBridgeEventDto = {
      ...baseRoute,
      outcome: TransactionOutcome.SUCCESS,
      transactionHash: '0xabc',
      durationMs: 5000,
    };

    it('creates and saves the event', async () => {
      const created = { id: 'uuid-1', ...dto };
      eventRepo.create!.mockReturnValue(created);
      eventRepo.save!.mockResolvedValue(created);
      metricRepo.update!.mockResolvedValue({ affected: 0 });

      const result = await service.recordEvent(dto);

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bridgeName: 'Stargate',
          outcome: TransactionOutcome.SUCCESS,
        }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('records a failed transfer', async () => {
      const failDto: RecordBridgeEventDto = {
        ...baseRoute,
        outcome: TransactionOutcome.FAILED,
        failureReason: 'Insufficient liquidity',
      };

      eventRepo.create!.mockReturnValue({ id: 'uuid-2', ...failDto });
      eventRepo.save!.mockResolvedValue({ id: 'uuid-2', ...failDto });
      metricRepo.update!.mockResolvedValue({ affected: 0 });

      const result = await service.recordEvent(failDto);
      expect(result.outcome).toBe(TransactionOutcome.FAILED);
    });

    it('records a timeout event', async () => {
      const timeoutDto: RecordBridgeEventDto = {
        ...baseRoute,
        outcome: TransactionOutcome.TIMEOUT,
        failureReason: 'Bridge response timed out after 30s',
      };

      eventRepo.create!.mockReturnValue({ id: 'uuid-3', ...timeoutDto });
      eventRepo.save!.mockResolvedValue({ id: 'uuid-3', ...timeoutDto });
      metricRepo.update!.mockResolvedValue({ affected: 0 });

      const result = await service.recordEvent(timeoutDto);
      expect(result.outcome).toBe(TransactionOutcome.TIMEOUT);
    });

    it('does not throw for cancelled transactions', async () => {
      const cancelDto: RecordBridgeEventDto = {
        ...baseRoute,
        outcome: TransactionOutcome.CANCELLED,
      };

      eventRepo.create!.mockReturnValue({ id: 'uuid-4', ...cancelDto });
      eventRepo.save!.mockResolvedValue({ id: 'uuid-4', ...cancelDto });
      metricRepo.update!.mockResolvedValue({ affected: 0 });

      await expect(service.recordEvent(cancelDto)).resolves.not.toThrow();
    });
  });

  // ─── getReliability - Transaction Count Window ─────────────────────────────

  describe('getReliability (TRANSACTION_COUNT)', () => {
    const dto: GetReliabilityDto = {
      ...baseRoute,
      windowMode: WindowMode.TRANSACTION_COUNT,
      windowSize: 100,
    };

    const mockMetric = {
      ...baseRoute,
      reliabilityScore: 97,
      lastComputedAt: new Date(),
    } as BridgeReliabilityMetric;

    it('returns HIGH tier for >= 95% success rate', async () => {
      // 97 successes, 2 failed, 1 timeout = 97%
      eventRepo.find!.mockResolvedValue(makeEvents(97, 2, 1));
      metricRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValue(mockMetric);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue(mockMetric);

      const result = await service.getReliability(dto);

      expect(result.reliabilityPercent).toBeGreaterThanOrEqual(95);
      expect(result.badge.tier).toBe(ReliabilityTier.HIGH);
    });

    it('returns MEDIUM tier for 85-94% success rate', async () => {
      // 88 successes out of 100 = 88%
      eventRepo.find!.mockResolvedValue(makeEvents(88, 12, 0));
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ ...mockMetric, lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(result.reliabilityPercent).toBeGreaterThanOrEqual(85);
      expect(result.reliabilityPercent).toBeLessThan(95);
      expect(result.badge.tier).toBe(ReliabilityTier.MEDIUM);
    });

    it('returns LOW tier for < 85% success rate', async () => {
      eventRepo.find!.mockResolvedValue(makeEvents(70, 20, 10));
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ ...mockMetric, lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(result.reliabilityPercent).toBeLessThan(85);
      expect(result.badge.tier).toBe(ReliabilityTier.LOW);
    });

    it('excludes CANCELLED transactions from reliability calculation', async () => {
      // 97 success + 3 cancelled: cancelled excluded → total = 97, success = 97 → 100%
      const events = makeEvents(97, 0, 0, 3);
      eventRepo.find!.mockResolvedValue(events);
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ ...mockMetric, lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(result.successfulTransfers).toBe(97);
      expect(result.totalAttempts).toBe(97); // cancelled excluded
    });

    it('returns 0 score when totalAttempts below minimum', async () => {
      eventRepo.find!.mockResolvedValue(makeEvents(3, 0, 0));
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ ...mockMetric, lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(result.reliabilityScore).toBe(0);
    });
  });

  // ─── getReliability - Time-Based Window ───────────────────────────────────

  describe('getReliability (TIME_BASED)', () => {
    it('queries events within the time window', async () => {
      const dto: GetReliabilityDto = {
        ...baseRoute,
        windowMode: WindowMode.TIME_BASED,
        windowSize: 7,
      };

      eventRepo.find!.mockResolvedValue(makeEvents(50, 2, 1));
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(eventRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.anything(), // MoreThanOrEqual matcher
          }),
        }),
      );
      expect(result.totalAttempts).toBe(53);
    });
  });

  // ─── Rolling Window Behavior ──────────────────────────────────────────────

  describe('rolling window behavior', () => {
    it('limits results to windowSize for TRANSACTION_COUNT mode', async () => {
      const dto: GetReliabilityDto = {
        ...baseRoute,
        windowMode: WindowMode.TRANSACTION_COUNT,
        windowSize: 50,
      };

      // Provide more events than window size; service should slice to 50
      const events = makeEvents(80, 10, 10); // 100 events
      eventRepo.find!.mockResolvedValue(events);
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ lastComputedAt: new Date() });

      const result = await service.getReliability(dto);

      expect(result.totalAttempts).toBeLessThanOrEqual(50);
    });

    it('reliability changes when rolling window excludes old failures', async () => {
      // Simulate that after removing old failures the score improves
      const dtoSmallWindow: GetReliabilityDto = {
        ...baseRoute,
        windowMode: WindowMode.TRANSACTION_COUNT,
        windowSize: 20,
      };

      // Recent 20: all successes
      eventRepo.find!.mockResolvedValue(makeEvents(20, 0, 0));
      metricRepo.findOne!.mockResolvedValue(null);
      metricRepo.create!.mockReturnValue({} as any);
      metricRepo.save!.mockResolvedValue({ lastComputedAt: new Date() });

      const result = await service.getReliability(dtoSmallWindow);
      expect(result.reliabilityPercent).toBe(100);
    });
  });

  // ─── Ranking Engine Integration ───────────────────────────────────────────

  describe('getReliabilityRankingFactor', () => {
    it('returns factor with no penalty for reliable bridge', async () => {
      metricRepo.findOne!.mockResolvedValue({
        ...baseRoute,
        reliabilityScore: 97,
      });

      const factor = await service.getReliabilityRankingFactor(
        baseRoute.bridgeName,
        baseRoute.sourceChain,
        baseRoute.destinationChain,
      );

      expect(factor.reliabilityScore).toBe(97);
      expect(factor.penaltyApplied).toBe(false);
      expect(factor.adjustedScore).toBe(97);
    });

    it('applies penalty for unreliable bridge', async () => {
      metricRepo.findOne!.mockResolvedValue({
        ...baseRoute,
        reliabilityScore: 70,
      });

      const factor = await service.getReliabilityRankingFactor(
        baseRoute.bridgeName,
        baseRoute.sourceChain,
        baseRoute.destinationChain,
      );

      expect(factor.penaltyApplied).toBe(true);
      expect(factor.adjustedScore).toBeLessThan(70);
    });

    it('skips penalty when ignoreReliability is true', async () => {
      metricRepo.findOne!.mockResolvedValue({
        ...baseRoute,
        reliabilityScore: 70,
      });

      const factor = await service.getReliabilityRankingFactor(
        baseRoute.bridgeName,
        baseRoute.sourceChain,
        baseRoute.destinationChain,
        { ignoreReliability: true },
      );

      expect(factor.penaltyApplied).toBe(false);
      expect(factor.adjustedScore).toBe(70);
    });

    it('returns score 0 when no metric exists for bridge', async () => {
      metricRepo.findOne!.mockResolvedValue(null);

      const factor = await service.getReliabilityRankingFactor(
        'UnknownBridge',
        'ethereum',
        'polygon',
      );

      expect(factor.reliabilityScore).toBe(0);
    });
  });

  describe('getBulkReliabilityFactors', () => {
    it('returns ranked factors for all bridges on a route', async () => {
      metricRepo.find!.mockResolvedValue([
        { bridgeName: 'Stargate', sourceChain: 'ethereum', destinationChain: 'polygon', reliabilityScore: 97 },
        { bridgeName: 'Across', sourceChain: 'ethereum', destinationChain: 'polygon', reliabilityScore: 72 },
        { bridgeName: 'Hop', sourceChain: 'ethereum', destinationChain: 'polygon', reliabilityScore: 88 },
      ]);

      const factors = await service.getBulkReliabilityFactors('ethereum', 'polygon');

      expect(factors).toHaveLength(3);

      const stargate = factors.find(f => f.bridgeName === 'Stargate')!;
      const across = factors.find(f => f.bridgeName === 'Across')!;

      expect(stargate.penaltyApplied).toBe(false);
      expect(across.penaltyApplied).toBe(true);
      expect(stargate.adjustedScore).toBeGreaterThan(across.adjustedScore);
    });
  });
});
