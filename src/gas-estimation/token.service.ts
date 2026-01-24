import { Injectable } from '@nestjs/common';
import { BigNumber } from 'bignumber.js';

@Injectable()
export class TokenService {
  /**
   * Normalize token amount to human-readable format
   * Handles different decimal places across networks
   */
  normalizeAmount(
    rawAmount: string | number,
    decimals: number,
    symbol: string,
  ): string {
    try {
      const amount = new BigNumber(rawAmount);
      const divisor = new BigNumber(10).pow(decimals);
      const normalized = amount.dividedBy(divisor);

      // Format based on the size of the number
      if (normalized.isLessThan(0.000001)) {
        return normalized.toFixed(decimals, BigNumber.ROUND_UP);
      } else if (normalized.isLessThan(0.01)) {
        return normalized.toFixed(6, BigNumber.ROUND_UP);
      } else if (normalized.isLessThan(1)) {
        return normalized.toFixed(4, BigNumber.ROUND_UP);
      } else {
        return normalized.toFixed(2, BigNumber.ROUND_UP);
      }
    } catch (error) {
      return '0';
    }
  }

  /**
   * Convert normalized amount back to raw units
   */
  denormalizeAmount(
    normalizedAmount: string | number,
    decimals: number,
  ): string {
    try {
      const amount = new BigNumber(normalizedAmount);
      const multiplier = new BigNumber(10).pow(decimals);
      return amount.multipliedBy(multiplier).toFixed(0);
    } catch (error) {
      return '0';
    }
  }

  /**
   * Convert between different token decimals
   */
  convertDecimals(
    amount: string | number,
    fromDecimals: number,
    toDecimals: number,
  ): string {
    try {
      const normalized = this.normalizeAmount(amount, fromDecimals, '');
      return this.denormalizeAmount(normalized, toDecimals);
    } catch (error) {
      return '0';
    }
  }

  /**
   * Add amounts with different decimals
   */
  addAmounts(
    amount1: string,
    decimals1: number,
    amount2: string,
    decimals2: number,
    resultDecimals: number,
  ): string {
    try {
      const normalized1 = new BigNumber(amount1).dividedBy(
        new BigNumber(10).pow(decimals1),
      );
      const normalized2 = new BigNumber(amount2).dividedBy(
        new BigNumber(10).pow(decimals2),
      );
      const sum = normalized1.plus(normalized2);
      
      return sum
        .multipliedBy(new BigNumber(10).pow(resultDecimals))
        .toFixed(0);
    } catch (error) {
      return '0';
    }
  }

  /**
   * Format amount with currency symbol
   */
  formatWithSymbol(amount: string, symbol: string): string {
    return `${amount} ${symbol}`;
  }

  /**
   * Calculate USD value if price is available
   */
  calculateUsdValue(
    amount: string,
    decimals: number,
    usdPrice: number,
  ): string {
    try {
      const normalized = this.normalizeAmount(amount, decimals, '');
      const usdValue = new BigNumber(normalized).multipliedBy(usdPrice);
      return usdValue.toFixed(2, BigNumber.ROUND_DOWN);
    } catch (error) {
      return '0.00';
    }
  }
}