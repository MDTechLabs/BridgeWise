import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum ChainType {
  EVM = 'evm',
  STELLAR = 'stellar',
}

@Entity('bridge_benchmarks')
@Index(['bridgeName', 'sourceChain', 'destinationChain'])
export class BridgeBenchmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bridge_name' })
  bridgeName: string;

  @Column({ name: 'source_chain' })
  sourceChain: string;

  @Column({ name: 'destination_chain' })
  destinationChain: string;

  @Column()
  token: string;

  @Column({
    name: 'source_chain_type',
    type: 'enum',
    enum: ChainType,
    default: ChainType.EVM,
  })
  sourceChainType: ChainType;

  @Column({
    name: 'destination_chain_type',
    type: 'enum',
    enum: ChainType,
    default: ChainType.EVM,
  })
  destinationChainType: ChainType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ name: 'transaction_hash', nullable: true })
  transactionHash: string | null;

  @Column({ name: 'destination_tx_hash', nullable: true })
  destinationTxHash: string | null;

  @Column({ name: 'quote_requested_at', type: 'timestamptz', nullable: true })
  quoteRequestedAt: Date | null;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'destination_confirmed_at', type: 'timestamptz', nullable: true })
  destinationConfirmedAt: Date | null;

  @Column({ name: 'completion_time', type: 'timestamptz', nullable: true })
  completionTime: Date | null;

  @Column({ name: 'duration_ms', type: 'bigint', nullable: true })
  durationMs: number | null;

  @Column({ name: 'amount', type: 'decimal', precision: 30, scale: 10, nullable: true })
  amount: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
