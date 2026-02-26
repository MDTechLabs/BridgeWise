import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * FeeEstimate Entity
 *
 * Stores dynamic fee estimates for bridge routes.
 * Includes breakdown of gas fees, bridge fees, and liquidity impact.
 */
@Entity('fee_estimates')
@Index(['bridgeName', 'sourceChain', 'destinationChain'])
@Index(['sourceChain', 'lastUpdated'])
export class FeeEstimate {
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

  @Column({ name: 'amount', type: 'decimal', precision: 30, scale: 10, nullable: true })
  amount: number | null;

  @Column({ name: 'total_fee', type: 'decimal', precision: 30, scale: 10 })
  totalFee: number;

  @Column({ name: 'gas_fee', type: 'decimal', precision: 30, scale: 10 })
  gasFee: number;

  @Column({ name: 'bridge_fee', type: 'decimal', precision: 30, scale: 10 })
  bridgeFee: number;

  @Column({ name: 'liquidity_fee', type: 'decimal', precision: 30, scale: 10, default: 0 })
  liquidityFee: number;

  @Column({ name: 'protocol_fee', type: 'decimal', precision: 30, scale: 10, default: 0 })
  protocolFee: number;

  @Column({ name: 'gas_price_gwei', type: 'decimal', precision: 20, scale: 4, nullable: true })
  gasPriceGwei: number | null;

  @Column({ name: 'gas_limit', type: 'bigint', nullable: true })
  gasLimit: number | null;

  @Column({ name: 'network_congestion', type: 'decimal', precision: 5, scale: 2, nullable: true })
  networkCongestion: number | null;

  @Column({ name: 'fee_token' })
  feeToken: string;

  @Column({ name: 'fee_token_price_usd', type: 'decimal', precision: 20, scale: 8, nullable: true })
  feeTokenPriceUsd: number | null;

  @Column({ name: 'total_fee_usd', type: 'decimal', precision: 20, scale: 8, nullable: true })
  totalFeeUsd: number | null;

  @Column({ name: 'is_fallback', default: false })
  isFallback: boolean;

  @Column({ name: 'fallback_reason', nullable: true })
  fallbackReason: string | null;

  @Column({ name: 'estimated_duration_seconds', type: 'int', nullable: true })
  estimatedDurationSeconds: number | null;

  @CreateDateColumn({ name: 'last_updated' })
  lastUpdated: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'cache_ttl_seconds', type: 'int', default: 60 })
  cacheTtlSeconds: number;
}
