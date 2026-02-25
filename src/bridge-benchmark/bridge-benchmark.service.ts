import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BridgeBenchmark,
  TransactionStatus,
} from './entities/bridge-benchmark.entity';
import {
  InitiateBenchmarkDto,
  ConfirmBenchmarkDto,
  UpdateBenchmarkStatusDto,
  SpeedMetricsQueryDto,
  RouteSpeedMetricDto,
  SpeedMetricsResponseDto,
} from './dto/bridge-benchmark.dto';

/**
 * Benchmark completed event payload
 */
interface BenchmarkCompletedEvent {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  status: 'confirmed' | 'failed';
  durationMs: number;
  amount?: number;
  slippagePercent?: number;
  fee?: number;
  completedAt: Date;
}

@Injectable()
export class BridgeBenchmarkService {
  private readonly logger = new Logger(BridgeBenchmarkService.name);

  constructor(
    @InjectRepository(BridgeBenchmark)
    private readonly benchmarkRepository: Repository<BridgeBenchmark>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async initiate(dto: InitiateBenchmarkDto): Promise<BridgeBenchmark> {
    const benchmark = this.benchmarkRepository.create({
      bridgeName: dto.bridgeName,
      sourceChain: dto.sourceChain,
      destinationChain: dto.destinationChain,
      token: dto.token,
      sourceChainType: dto.sourceChainType,
      destinationChainType: dto.destinationChainType,
      amount: dto.amount,
      quoteRequestedAt: dto.quoteRequestedAt
        ? new Date(dto.quoteRequestedAt)
        : null,
      startTime: new Date(),
      status: TransactionStatus.SUBMITTED,
    });

    return this.benchmarkRepository.save(benchmark);
  }

  async confirm(
    id: string,
    dto: ConfirmBenchmarkDto,
  ): Promise<BridgeBenchmark> {
    const benchmark = await this.findOneOrFail(id);

    if (benchmark.status === TransactionStatus.CONFIRMED) {
      throw new BadRequestException('Benchmark already confirmed');
    }

    const now = new Date();
    const durationMs = now.getTime() - benchmark.startTime.getTime();

    benchmark.destinationConfirmedAt = now;
    benchmark.completionTime = now;
    benchmark.durationMs = durationMs;
    benchmark.status = TransactionStatus.CONFIRMED;

    if (dto.transactionHash) {
      benchmark.transactionHash = dto.transactionHash;
    }
    if (dto.destinationTxHash) {
      benchmark.destinationTxHash = dto.destinationTxHash;
    }

    const saved = await this.benchmarkRepository.save(benchmark);

    // Emit event for analytics collection
    const event: BenchmarkCompletedEvent = {
      id: saved.id,
      bridgeName: saved.bridgeName,
      sourceChain: saved.sourceChain,
      destinationChain: saved.destinationChain,
      token: saved.token,
      status: 'confirmed',
      durationMs,
      amount: saved.amount || undefined,
      completedAt: now,
    };

    this.eventEmitter.emit('benchmark.completed', event);
    this.logger.debug(`Emitted benchmark.completed event for ${id}`);

    return saved;
  }

  async updateStatus(
    id: string,
    dto: UpdateBenchmarkStatusDto,
  ): Promise<BridgeBenchmark> {
    const benchmark = await this.findOneOrFail(id);

    const previousStatus = benchmark.status;
    benchmark.status = dto.status;
    if (dto.transactionHash) {
      benchmark.transactionHash = dto.transactionHash;
    }

    const saved = await this.benchmarkRepository.save(benchmark);

    // Emit event if status changed to failed
    if (dto.status === TransactionStatus.FAILED && previousStatus !== TransactionStatus.FAILED) {
      const now = new Date();
      const durationMs = benchmark.startTime
        ? now.getTime() - benchmark.startTime.getTime()
        : 0;

      const event: BenchmarkCompletedEvent = {
        id: saved.id,
        bridgeName: saved.bridgeName,
        sourceChain: saved.sourceChain,
        destinationChain: saved.destinationChain,
        token: saved.token,
        status: 'failed',
        durationMs,
        amount: saved.amount || undefined,
        completedAt: now,
      };

      this.eventEmitter.emit('benchmark.completed', event);
      this.logger.debug(`Emitted benchmark.completed (failed) event for ${id}`);
    }

    return saved;
  }

  async getSpeedMetrics(
    query: SpeedMetricsQueryDto,
  ): Promise<SpeedMetricsResponseDto> {
    const rollingWindow = query.rollingWindow ?? 50;

    const qb = this.benchmarkRepository
      .createQueryBuilder('b')
      .select('b.bridge_name', 'bridgeName')
      .addSelect('b.source_chain', 'sourceChain')
      .addSelect('b.destination_chain', 'destinationChain')
      .addSelect('b.token', 'token')
      .addSelect('AVG(b.duration_ms)', 'avgDurationMs')
      .addSelect('MIN(b.duration_ms)', 'minDurationMs')
      .addSelect('MAX(b.duration_ms)', 'maxDurationMs')
      .addSelect('COUNT(*)', 'totalTransactions')
      .addSelect(
        `COUNT(*) FILTER (WHERE b.status = '${TransactionStatus.CONFIRMED}')`,
        'successfulTransactions',
      )
      .addSelect('MAX(b.completion_time)', 'lastUpdated')
      .where('b.status = :status', { status: TransactionStatus.CONFIRMED })
      .andWhere('b.duration_ms IS NOT NULL')
      .groupBy('b.bridge_name')
      .addGroupBy('b.source_chain')
      .addGroupBy('b.destination_chain')
      .addGroupBy('b.token');

    if (query.bridgeName) {
      qb.andWhere('b.bridge_name = :bridgeName', {
        bridgeName: query.bridgeName,
      });
    }
    if (query.sourceChain) {
      qb.andWhere('b.source_chain = :sourceChain', {
        sourceChain: query.sourceChain,
      });
    }
    if (query.destinationChain) {
      qb.andWhere('b.destination_chain = :destinationChain', {
        destinationChain: query.destinationChain,
      });
    }
    if (query.token) {
      qb.andWhere('b.token = :token', { token: query.token });
    }

    const rawMetrics: Array<{
      bridgeName: string;
      sourceChain: string;
      destinationChain: string;
      token: string;
      avgDurationMs: string;
      minDurationMs: string;
      maxDurationMs: string;
      totalTransactions: string;
      successfulTransactions: string;
      lastUpdated: Date;
    }> = await qb.getRawMany();

    const metrics: RouteSpeedMetricDto[] = await Promise.all(
      rawMetrics.map(async (row) => {
        const rollingAvgDurationMs = await this.computeRollingAverage(
          row.bridgeName,
          row.sourceChain,
          row.destinationChain,
          row.token,
          rollingWindow,
        );

        const total = parseInt(row.totalTransactions, 10);
        const successful = parseInt(row.successfulTransactions, 10);

        return {
          bridgeName: row.bridgeName,
          sourceChain: row.sourceChain,
          destinationChain: row.destinationChain,
          token: row.token,
          avgDurationMs: parseFloat(row.avgDurationMs),
          minDurationMs: parseInt(row.minDurationMs, 10),
          maxDurationMs: parseInt(row.maxDurationMs, 10),
          totalTransactions: total,
          successfulTransactions: successful,
          successRate: total > 0 ? (successful / total) * 100 : 0,
          rollingAvgDurationMs,
          lastUpdated: row.lastUpdated,
        };
      }),
    );

    return {
      metrics,
      generatedAt: new Date(),
    };
  }

  async getRankingMetrics(): Promise<
    Array<{
      bridgeName: string;
      sourceChain: string;
      destinationChain: string;
      token: string;
      rollingAvgDurationMs: number;
      successRate: number;
    }>
  > {
    const result = await this.getSpeedMetrics({ rollingWindow: 50 });

    return result.metrics.map((m) => ({
      bridgeName: m.bridgeName,
      sourceChain: m.sourceChain,
      destinationChain: m.destinationChain,
      token: m.token,
      rollingAvgDurationMs: m.rollingAvgDurationMs,
      successRate: m.successRate,
    }));
  }

  async findOne(id: string): Promise<BridgeBenchmark | null> {
    return this.benchmarkRepository.findOne({ where: { id } });
  }

  private async findOneOrFail(id: string): Promise<BridgeBenchmark> {
    const benchmark = await this.findOne(id);
    if (!benchmark) {
      throw new NotFoundException(`Benchmark with id ${id} not found`);
    }
    return benchmark;
  }

  private async computeRollingAverage(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
    token: string,
    windowSize: number,
  ): Promise<number> {
    const rows = await this.benchmarkRepository
      .createQueryBuilder('b')
      .select('b.duration_ms', 'durationMs')
      .where('b.bridge_name = :bridgeName', { bridgeName })
      .andWhere('b.source_chain = :sourceChain', { sourceChain })
      .andWhere('b.destination_chain = :destinationChain', { destinationChain })
      .andWhere('b.token = :token', { token })
      .andWhere('b.status = :status', { status: TransactionStatus.CONFIRMED })
      .andWhere('b.duration_ms IS NOT NULL')
      .orderBy('b.completion_time', 'DESC')
      .limit(windowSize)
      .getRawMany<{ durationMs: string }>();

    if (rows.length === 0) return 0;

    const sum = rows.reduce((acc, r) => acc + parseInt(r.durationMs, 10), 0);
    return sum / rows.length;
  }
}
