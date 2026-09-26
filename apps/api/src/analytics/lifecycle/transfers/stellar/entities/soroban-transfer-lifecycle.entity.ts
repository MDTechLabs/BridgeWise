import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LifecycleStage, TransferOutcome } from '../types/lifecycle.types';

/**
 * SorobanTransferLifecycle Entity
 *
 * Stores one row per lifecycle stage event for each Soroban/Stellar transfer.
 * Queries aggregate across all events for a transferId to reconstruct
 * the full lifecycle and compute per-stage durations.
 *
 * Table: soroban_transfer_lifecycle_events
 */
@Entity('soroban_transfer_lifecycle_events')
@Index(['transferId'])
@Index(['stage'])
@Index(['sourceChain', 'destinationChain'])
@Index(['recordedAt'])
@Index(['outcome'])
export class SorobanTransferLifecycleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identifies the transfer this event belongs to */
  @Column({ name: 'transfer_id' })
  @Index()
  transferId: string;

  /** The lifecycle stage reached */
  @Column({
    name: 'stage',
    type: 'enum',
    enum: LifecycleStage,
  })
  stage: LifecycleStage;

  /** Source chain identifier (e.g. "stellar", "ethereum") */
  @Column({ name: 'source_chain', nullable: true })
  sourceChain: string | null;

  /** Destination chain identifier */
  @Column({ name: 'destination_chain', nullable: true })
  destinationChain: string | null;

  /** Asset/token symbol */
  @Column({ name: 'asset', nullable: true })
  asset: string | null;

  /** Bridge/provider name */
  @Column({ name: 'bridge_name', nullable: true })
  bridgeName: string | null;

  /**
   * Duration in milliseconds from the immediately preceding stage.
   * NULL for the INITIATED stage (first event).
   */
  @Column({ name: 'duration_from_previous_ms', type: 'bigint', nullable: true })
  durationFromPreviousMs: number | null;

  /**
   * Final outcome — populated only on terminal events (SETTLED / FAILED / TIMEOUT).
   * Allows fast filtering without aggregating all events.
   */
  @Column({
    name: 'outcome',
    type: 'enum',
    enum: TransferOutcome,
    nullable: true,
  })
  outcome: TransferOutcome | null;

  /** Error description when stage === FAILED */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** Arbitrary JSON metadata (tx hashes, block numbers, etc.) */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** When this stage event was recorded */
  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
