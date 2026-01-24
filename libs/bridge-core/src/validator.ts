import { RouteRequest, BridgeRoute, NormalizedRoute, ChainId } from './types';

/**
 * Validation error with actionable message
 */
export interface ValidationError {
  code: string;
  message: string;
  field: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Bridge execution request with user details
 */
export interface BridgeExecutionRequest extends RouteRequest {
  /** User's wallet address */
  walletAddress: string;
  /** Current user balance on source chain (in smallest unit) */
  userBalance: string;
  /** Current token allowance for bridge contract (in smallest unit) */
  tokenAllowance?: string;
  /** Current connected chain */
  connectedChain: ChainId;
}

/**
 * Supported chains and their properties
 */
const CHAIN_PROPERTIES: Record<ChainId, { name: string; isEVM: boolean }> = {
  ethereum: { name: 'Ethereum', isEVM: true },
  stellar: { name: 'Stellar', isEVM: false },
  polygon: { name: 'Polygon', isEVM: true },
  arbitrum: { name: 'Arbitrum', isEVM: true },
  optimism: { name: 'Optimism', isEVM: true },
  base: { name: 'Base', isEVM: true },
  gnosis: { name: 'Gnosis', isEVM: true },
  nova: { name: 'Arbitrum Nova', isEVM: true },
  bsc: { name: 'BSC', isEVM: true },
  avalanche: { name: 'Avalanche', isEVM: true },
};

/**
 * Chain bridge compatibility map - tracks which chains can bridge to which
 */
const CHAIN_COMPATIBILITY: Record<ChainId, ChainId[]> = {
  ethereum: ['polygon', 'arbitrum', 'optimism', 'base', 'gnosis', 'nova', 'bsc', 'avalanche'],
  polygon: ['ethereum', 'arbitrum', 'optimism', 'base', 'gnosis', 'nova', 'bsc', 'avalanche'],
  arbitrum: ['ethereum', 'polygon', 'optimism', 'base', 'gnosis', 'nova', 'bsc', 'avalanche'],
  optimism: ['ethereum', 'polygon', 'arbitrum', 'base', 'gnosis', 'nova', 'bsc', 'avalanche'],
  base: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'gnosis', 'nova', 'bsc', 'avalanche'],
  gnosis: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'nova', 'bsc', 'avalanche'],
  nova: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'gnosis', 'bsc', 'avalanche'],
  bsc: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'gnosis', 'nova', 'avalanche'],
  avalanche: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'gnosis', 'nova', 'bsc'],
  stellar: [], // Stellar is non-EVM and has limited bridge partners
};

/**
 * Validator service for bridge route execution
 */
export class BridgeValidator {
  /**
   * Validate a bridge execution request
   * Checks: balance, allowance, network compatibility, and chain support
   */
  validateExecutionRequest(request: BridgeExecutionRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate chain compatibility
    const chainCompatErrors = this.validateChainCompatibility(
      request.sourceChain,
      request.targetChain
    );
    errors.push(...chainCompatErrors);

    // Validate connected chain matches source chain
    if (request.connectedChain !== request.sourceChain) {
      errors.push({
        code: 'NETWORK_MISMATCH',
        message: `Wrong network connected. Please switch to ${CHAIN_PROPERTIES[request.sourceChain].name}. Currently on ${CHAIN_PROPERTIES[request.connectedChain].name}.`,
        field: 'connectedChain',
        severity: 'error',
      });
    }

    // Validate user balance
    const balanceErrors = this.validateBalance(
      request.assetAmount,
      request.userBalance
    );
    errors.push(...balanceErrors);

    // Validate token allowance (for EVM chains with non-native tokens)
    if (CHAIN_PROPERTIES[request.sourceChain].isEVM && request.tokenAllowance !== undefined) {
      const allowanceErrors = this.validateAllowance(
        request.assetAmount,
        request.tokenAllowance
      );
      errors.push(...allowanceErrors);
    }

    // Validate input amount
    const amountErrors = this.validateAmount(request.assetAmount);
    errors.push(...amountErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate chain compatibility
   */
  private validateChainCompatibility(
    sourceChain: ChainId,
    targetChain: ChainId
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if source and target chains are different
    if (sourceChain === targetChain) {
      errors.push({
        code: 'SAME_CHAIN',
        message: 'Source and target chains must be different.',
        field: 'chains',
        severity: 'error',
      });
      return errors;
    }

    // Check if bridge route is supported
    if (!CHAIN_COMPATIBILITY[sourceChain]?.includes(targetChain)) {
      const sourceName = CHAIN_PROPERTIES[sourceChain]?.name || sourceChain;
      const targetName = CHAIN_PROPERTIES[targetChain]?.name || targetChain;
      errors.push({
        code: 'UNSUPPORTED_CHAIN_PAIR',
        message: `Bridging from ${sourceName} to ${targetName} is not currently supported.`,
        field: 'targetChain',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate user has sufficient balance
   */
  private validateBalance(requiredAmount: string, userBalance: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const required = BigInt(requiredAmount);
      const balance = BigInt(userBalance);

      if (balance < required) {
        const deficitWei = required - balance;
        errors.push({
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient balance. You need ${requiredAmount} but have ${userBalance}. Missing: ${deficitWei.toString()}.`,
          field: 'userBalance',
          severity: 'error',
        });
      }
    } catch {
      errors.push({
        code: 'INVALID_AMOUNT_FORMAT',
        message: 'Invalid balance or required amount format. Expected numeric strings.',
        field: 'userBalance',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate token allowance is sufficient
   */
  private validateAllowance(requiredAmount: string, allowance: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const required = BigInt(requiredAmount);
      const currentAllowance = BigInt(allowance);

      if (currentAllowance < required) {
        const additionalAllowance = required - currentAllowance;
        errors.push({
          code: 'INSUFFICIENT_ALLOWANCE',
          message: `Token allowance is insufficient. Current: ${allowance}, Required: ${requiredAmount}. You need to approve an additional ${additionalAllowance.toString()} tokens.`,
          field: 'tokenAllowance',
          severity: 'error',
        });
      }
    } catch {
      errors.push({
        code: 'INVALID_ALLOWANCE_FORMAT',
        message: 'Invalid allowance format. Expected numeric string.',
        field: 'tokenAllowance',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate amount is positive and non-zero
   */
  private validateAmount(amount: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const parsed = BigInt(amount);

      if (parsed === 0n) {
        errors.push({
          code: 'ZERO_AMOUNT',
          message: 'Bridge amount must be greater than zero.',
          field: 'assetAmount',
          severity: 'error',
        });
      }

      if (parsed < 0n) {
        errors.push({
          code: 'NEGATIVE_AMOUNT',
          message: 'Bridge amount cannot be negative.',
          field: 'assetAmount',
          severity: 'error',
        });
      }
    } catch {
      errors.push({
        code: 'INVALID_AMOUNT_FORMAT',
        message: 'Invalid amount format. Expected numeric string.',
        field: 'assetAmount',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate a selected route before execution
   */
  validateRoute(route: NormalizedRoute, request: BridgeExecutionRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate route matches request
    if (route.sourceChain !== request.sourceChain) {
      errors.push({
        code: 'ROUTE_MISMATCH',
        message: `Route source chain (${route.sourceChain}) does not match request source chain (${request.sourceChain}).`,
        field: 'route',
        severity: 'error',
      });
    }

    if (route.destinationChain !== request.targetChain) {
      errors.push({
        code: 'ROUTE_MISMATCH',
        message: `Route destination chain (${route.destinationChain}) does not match request target chain (${request.targetChain}).`,
        field: 'route',
        severity: 'error',
      });
    }

    // For validation, we need to estimate the input amount from the first hop
    // Since NormalizedRoute doesn't have inputAmount, we'll assume the request amount is correct
    // and validate that the route can handle it

    // Validate deadline if present (from metadata)
    const deadline = route.metadata?.deadline as number;
    if (deadline) {
      const now = Math.floor(Date.now() / 1000);
      if (deadline < now) {
        errors.push({
          code: 'EXPIRED_ROUTE',
          message: 'This route has expired. Please fetch a new quote.',
          field: 'deadline',
          severity: 'error',
        });
      } else if (deadline - now < 60) {
        warnings.push({
          code: 'ROUTE_EXPIRING_SOON',
          message: 'This route will expire soon. Execute quickly to avoid expiration.',
          field: 'deadline',
          severity: 'warning',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get summary of all supported chains
   */
  getSupportedChains(): Array<{ id: ChainId; name: string; isEVM: boolean }> {
    return Object.entries(CHAIN_PROPERTIES).map(([id, props]) => ({
      id: id as ChainId,
      name: props.name,
      isEVM: props.isEVM,
    }));
  }

  /**
   * Get compatible target chains for a source chain
   */
  getCompatibleChains(sourceChain: ChainId): ChainId[] {
    return CHAIN_COMPATIBILITY[sourceChain] || [];
  }
}
