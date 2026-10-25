import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type DriftSeverity = 'normal' | 'warning' | 'critical';

export type DriftDirection = 'surplus' | 'deficit' | 'none';

@Entity('balance_drift_records')
export class BalanceDriftRecord {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'chain_id' })
  chainId: string;

  @Column({ name: 'contract_address' })
  contractAddress: string;

  @Column({ name: 'asset' })
  asset: string;

  @Column('decimal', { precision: 78, scale: 0 })
  expectedBalance: string;

  @Column('decimal', { precision: 78, scale: 0 })
  observedBalance: string;

  @Column('decimal', { precision: 78, scale: 0 })
  driftAmount: string;

  @Column({ type: 'enum', enum: ['normal', 'warning', 'critical'] })
  severity: DriftSeverity;

  @Column({ type: 'enum', enum: ['surplus', 'deficit', 'none'] })
  direction: DriftDirection;

  @Column({ name: 'threshold_warning' })
  thresholdWarning: string;

  @Column({ name: 'threshold_critical' })
  thresholdCritical: string;

  @Column({ name: 'checked_at' })
  checkedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}