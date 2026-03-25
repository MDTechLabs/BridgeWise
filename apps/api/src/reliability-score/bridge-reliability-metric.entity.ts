import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { ReliabilityTier } from './reliability.enum';

@Entity('bridge_reliability_metrics')
@Unique(['bridgeName', 'sourceChain', 'destinationChain'])
export class BridgeReliabilityMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @Index()
  bridgeName: string;

  @Column({ length: 50 })
  sourceChain: string;

  @Column({ length: 50 })
  destinationChain: string;

  @Column({ type: 'int', default: 0 })
  totalAttempts: number;

  @Column({ type: 'int', default: 0 })
  successfulTransfers: number;

  @Column({ type: 'int', default: 0 })
  failedTransfers: number;

  @Column({ type: 'int', default: 0 })
  timeoutCount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  reliabilityPercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  reliabilityScore: number;

  @Column({ type: 'enum', enum: ReliabilityTier, default: ReliabilityTier.LOW })
  reliabilityTier: ReliabilityTier;

  @Column({ type: 'jsonb', nullable: true })
  windowConfig: {
    mode: string;
    size: number;
  } | null;

  @UpdateDateColumn()
  lastComputedAt: Date;
}
