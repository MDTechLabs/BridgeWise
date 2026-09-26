import { Injectable } from '@nestjs/common';
import { CalculateRelayerFeeDto } from './dto/relayer-fee.dto';

@Injectable()
export class RelayerFeeService {
  /**
   * Calculates a dynamic relayer fee based on the transaction volume.
   * - Base fee: $0.50
   * - Tier 1 (< $1,000): 0.1% of volume
   * - Tier 2 (>= $1,000): 0.05% of volume
   */
  public calculateFee(dto: CalculateRelayerFeeDto): number {
    const baseFee = 0.5;
    let variableFee = 0;

    if (dto.volumeUsd < 1000) {
      variableFee = dto.volumeUsd * 0.001; // 0.1%
    } else {
      variableFee = dto.volumeUsd * 0.0005; // 0.05%
    }

    return baseFee + variableFee;
  }
}
