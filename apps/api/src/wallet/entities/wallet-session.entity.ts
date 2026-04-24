import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WalletSessionStatus {
  ACTIVE = 'active',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
}

/**
 * Wallet session entity
 * Tracks wallet connection sessions for audit and recovery
 */
@Entity('wallet_sessions')
export class WalletSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  walletType: string;

  @Column({ type: 'varchar', length: 20 })
  networkType: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  publicKey: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  chainId: string;

  @Column({
    type: 'enum',
    enum: WalletSessionStatus,
    default: WalletSessionStatus.ACTIVE,
  })
  @Index()
  status: WalletSessionStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  connectedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  disconnectedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
