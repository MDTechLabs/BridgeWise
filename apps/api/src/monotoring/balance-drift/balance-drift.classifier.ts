import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceDriftRecord, DriftSeverity, DriftDirection } from './balance-drift.entity';

export interface BalanceSnapshot {
  chainId: string;
  contractAddress: string;
  asset: string;
  expectedBalance: string;
  observedBalance: string;
}

export interface DriftThresholds {
  warning: string;
  critical: string;
}

export interface DriftClassification {
  severity: DriftSeverity;
  direction: DriftDirection;
  driftAmount: string;
  thresholds: DriftThresholds;
}

const DEFAULT_THRESHOLDS: DriftThresholds = {
  warning: '1000000',
  critical: '10000000',
};

@Injectable()
export class BalanceDriftClassifier {
  private readonly logger = new Logger(BalanceDriftClassifier.name);

  constructor(
    @InjectRepository(BalanceDriftRecord)
    private readonly driftRepository: Repository<BalanceDriftRecord>,
  ) {}

  async classifyAndRecord(
    snapshot: BalanceSnapshot,
    thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
  ): Promise<DriftClassification> {
    const classification = this.classify(snapshot, thresholds);

    const record = this.driftRepository.create({
      id: crypto.randomUUID(),
      chainId: snapshot.chainId,
      contractAddress: snapshot.contractAddress,
      asset: snapshot.asset,
      expectedBalance: snapshot.expectedBalance,
      observedBalance: snapshot.observedBalance,
      driftAmount: classification.driftAmount,
      severity: classification.severity,
      direction: classification.direction,
      thresholdWarning: thresholds.warning,
      thresholdCritical: thresholds.critical,
      checkedAt: new Date(),
    });

    await this.driftRepository.save(record);

    this.logger.log(
      `Balance drift classified: chain=${snapshot.chainId} contract=${snapshot.contractAddress} asset=${snapshot.asset} severity=${classification.severity} direction=${classification.direction} drift=${classification.driftAmount}`,
    );

    return classification;
  }

  classify(
    snapshot: BalanceSnapshot,
    thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
  ): DriftClassification {
    const driftAmount = this.subtract(snapshot.observedBalance, snapshot.expectedBalance);
    const direction = this.determineDirection(driftAmount);
    const absDrift = this.absoluteValue(driftAmount);
    const severity = this.determineSeverity(absDrift, thresholds);

    return { severity, direction, driftAmount, thresholds };
  }

  async getRecords(severity?: DriftSeverity): Promise<BalanceDriftRecord[]> {
    if (severity) {
      return this.driftRepository.find({ where: { severity }, order: { checkedAt: 'DESC' } });
    }
    return this.driftRepository.find({ order: { checkedAt: 'DESC' } });
  }

  private determineSeverity(absDrift: string, thresholds: DriftThresholds): DriftSeverity {
    if (this.compare(absDrift, thresholds.critical) >= 0) return 'critical';
    if (this.compare(absDrift, thresholds.warning) >= 0) return 'warning';
    return 'normal';
  }

  private determineDirection(driftAmount: string): DriftDirection {
    if (this.compare(driftAmount, '0') > 0) return 'surplus';
    if (this.compare(driftAmount, '0') < 0) return 'deficit';
    return 'none';
  }

  private subtract(a: string, b: string): string {
    const aScaled = this.toBigInt(a);
    const bScaled = this.toBigInt(b);
    return (aScaled - bScaled).toString();
  }

  private absoluteValue(value: string): string {
    return value.startsWith('-') ? value.slice(1) : value;
  }

  private compare(a: string, b: string): number {
    const aBig = this.toBigInt(a);
    const bBig = this.toBigInt(b);
    if (aBig === bBig) return 0;
    return aBig > bBig ? 1 : -1;
  }

  private toBigInt(value: string): bigint {
    const [intPart, fracPart = ''] = value.split('.');
    const scale = fracPart.length;
    const combined = (intPart || '0') + fracPart;
    return BigInt(combined) * BigInt(10 ** (6 - scale));
  }
}