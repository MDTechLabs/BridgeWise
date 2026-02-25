import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * BridgeAnalytics Entity
 *
 * Stores aggregated analytics data for bridge routes including:
 * - Transfer counts (total, successful, failed)
 * - Performance metrics (settlement times, fees)
 * - Slippage statistics
 * - Last updated timestamp for cache invalidation
 */
@Entity('bridge_analytics')
@Index(['bridgeName', 'sourceChain', 'destinationChain'])
@Index(['lastUpdated'])
export class BridgeAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bridge_name' })
  bridgeName: string;

  @Column({ name: 'source_chain' })
  sourceChain: string;

  @Column({ name: 'destination_chain' })
  destinationChain: string;

  @Column({ name: 'token', nullable: true })
  token: string | null;

  @Column({ name: 'total_transfers', type: 'int', default: 0 })
  totalTransfers: number;

  @Column({ name: 'successful_transfers', type: 'int', default: 0 })
  successfulTransfers: number;

  @Column({ name: 'failed_transfers', type: 'int', default: 0 })
  failedTransfers: number;

  @Column({ name: 'average_settlement_time_ms', type: 'bigint', nullable: true })
  averageSettlementTimeMs: number | null;

  @Column({ name: 'average_fee', type: 'decimal', precision: 30, scale: 10, nullable: true })
  averageFee: number | null;

  @Column({ name: 'average_slippage_percent', type: 'decimal', precision: 10, scale: 4, nullable: true })
  averageSlippagePercent: number | null;

  @Column({ name: 'total_volume', type: 'decimal', precision: 30, scale: 10, default: 0 })
  totalVolume: number;

  @Column({ name: 'min_settlement_time_ms', type: 'bigint', nullable: true })
  minSettlementTimeMs: number | null;

  @Column({ name: 'max_settlement_time_ms', type: 'bigint', nullable: true })
  maxSettlementTimeMs: number | null;

  @UpdateDateColumn({ name: 'last_updated' })
  lastUpdated: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Computed success rate percentage
   */
  get successRate(): number {
    if (this.totalTransfers === 0) return 0;
    return (this.successfulTransfers / this.totalTransfers) * 100;
  }

  /**
   * Computed failure rate percentage
   */
  get failureRate(): number {
    if (this.totalTransfers === 0) return 0;
    return (this.failedTransfers / this.totalTransfers) * 100;
  }
}
