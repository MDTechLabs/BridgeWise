import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TransactionOutcome } from './reliability.enum';

@Entity('bridge_transaction_events')
@Index(['bridgeName', 'sourceChain', 'destinationChain', 'createdAt'])
export class BridgeTransactionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @Index()
  bridgeName: string;

  @Column({ length: 50 })
  sourceChain: string;

  @Column({ length: 50 })
  destinationChain: string;

  @Column({ type: 'enum', enum: TransactionOutcome })
  outcome: TransactionOutcome;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  transactionHash: string | null;

  @Column({ nullable: true, type: 'text' })
  failureReason: string | null;

  @Column({ type: 'int', default: 0, comment: 'ms to settlement or timeout' })
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
