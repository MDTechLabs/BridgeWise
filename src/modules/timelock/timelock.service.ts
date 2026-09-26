import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { VetoTimelockDto } from './dto/timelock.dto';

@Injectable()
export class TimelockService {
  private timelockedTransactions = new Map<string, { status: string; vetoedBy?: string; reason?: string }>();

  constructor() {
    // Seed some mock data
    this.timelockedTransactions.set('tx-123', { status: 'PENDING' });
  }

  /**
   * Allows a guardian to veto a transaction before the timelock expires.
   */
  public vetoTransaction(dto: VetoTimelockDto) {
    const tx = this.timelockedTransactions.get(dto.transactionId);
    if (!tx) {
      throw new NotFoundException('Transaction not found in timelock');
    }
    
    if (tx.status !== 'PENDING') {
      throw new ForbiddenException(`Transaction cannot be vetoed. Current status: ${tx.status}`);
    }

    tx.status = 'VETOED';
    tx.vetoedBy = dto.guardianId;
    tx.reason = dto.reason;

    return tx;
  }
}
