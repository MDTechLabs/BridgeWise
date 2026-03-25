/**
 * Compatibility Error Handler Tests
 */

import {
  CompatibilityErrorHandler,
  CompatibilityError,
} from '../errors';
import { TokenPairErrorCode, TokenPairValidationError } from '../types';

describe('CompatibilityErrorHandler', () => {
  describe('toUserFriendlyError', () => {
    it('should convert validation error to user-friendly format', () => {
      const error: TokenPairValidationError = {
        code: TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
        message: 'Chain pair not supported',
        field: 'chainPair',
        suggestions: ['Try a different bridge'],
      };

      const userFriendly = CompatibilityErrorHandler.toUserFriendlyError(error);

      expect(userFriendly.title).toBe('Route Not Available');
      expect(userFriendly.message).toBe('Chain pair not supported');
      expect(userFriendly.suggestions).toContain('Try a different bridge');
      expect(userFriendly.severity).toBe('error');
      expect(userFriendly.code).toBe(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR);
    });

    it('should use default message when not provided', () => {
      const error: TokenPairValidationError = {
        code: TokenPairErrorCode.BRIDGE_NOT_AVAILABLE,
        message: '',
        field: 'bridgeName',
      };

      const userFriendly = CompatibilityErrorHandler.toUserFriendlyError(error);

      expect(userFriendly.message).toBe('This bridge is currently unavailable');
    });

    it('should set correct severity for warnings', () => {
      const error: TokenPairValidationError = {
        code: TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
        message: 'Low liquidity',
        field: 'liquidity',
      };

      const userFriendly = CompatibilityErrorHandler.toUserFriendlyError(error);

      expect(userFriendly.severity).toBe('warning');
    });

    it('should set correct severity for info', () => {
      const error: TokenPairValidationError = {
        code: TokenPairErrorCode.BRIDGE_PAUSED,
        message: 'Bridge paused',
        field: 'bridgeName',
      };

      const userFriendly = CompatibilityErrorHandler.toUserFriendlyError(error);

      expect(userFriendly.severity).toBe('info');
    });
  });

  describe('formatErrorsForApi', () => {
    it('should format errors for API response', () => {
      const errors: TokenPairValidationError[] = [
        {
          code: TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
          message: 'Chain pair not supported',
          field: 'chainPair',
          suggestions: ['Try a different bridge'],
        },
        {
          code: TokenPairErrorCode.TOKEN_NOT_REGISTERED,
          message: 'Token not found',
          field: 'sourceToken',
        },
      ];

      const formatted = CompatibilityErrorHandler.formatErrorsForApi(errors);

      expect(formatted).toHaveLength(2);
      expect(formatted[0].code).toBe(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR);
      expect(formatted[0].suggestions).toContain('Try a different bridge');
      expect(formatted[1].code).toBe(TokenPairErrorCode.TOKEN_NOT_REGISTERED);
      expect(formatted[1].suggestions).toBeDefined();
    });
  });

  describe('createError', () => {
    it('should create a validation error', () => {
      const error = CompatibilityErrorHandler.createError(
        TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR,
        'tokenPair',
        'Custom message',
        { custom: 'context' },
        ['Suggestion 1'],
      );

      expect(error.code).toBe(TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR);
      expect(error.field).toBe('tokenPair');
      expect(error.message).toBe('Custom message');
      expect(error.context).toEqual({ custom: 'context' });
      expect(error.suggestions).toContain('Suggestion 1');
    });

    it('should use default message when not provided', () => {
      const error = CompatibilityErrorHandler.createError(
        TokenPairErrorCode.BRIDGE_NOT_AVAILABLE,
        'bridgeName',
      );

      expect(error.message).toBe('This bridge is currently unavailable');
      expect(error.suggestions).toBeDefined();
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for recoverable errors', () => {
      expect(
        CompatibilityErrorHandler.isRecoverableError(TokenPairErrorCode.INSUFFICIENT_LIQUIDITY),
      ).toBe(true);
      expect(
        CompatibilityErrorHandler.isRecoverableError(TokenPairErrorCode.BRIDGE_PAUSED),
      ).toBe(true);
      expect(
        CompatibilityErrorHandler.isRecoverableError(TokenPairErrorCode.AMOUNT_BELOW_MINIMUM),
      ).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      expect(
        CompatibilityErrorHandler.isRecoverableError(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR),
      ).toBe(false);
      expect(
        CompatibilityErrorHandler.isRecoverableError(TokenPairErrorCode.TOKEN_NOT_REGISTERED),
      ).toBe(false);
    });
  });

  describe('getFallbackBridge', () => {
    it('should return fallback bridge for hop', () => {
      const fallback = CompatibilityErrorHandler.getFallbackBridge(
        'ethereum',
        'polygon',
        'hop',
      );

      expect(fallback).toBe('layerzero');
    });

    it('should return fallback bridge for layerzero', () => {
      const fallback = CompatibilityErrorHandler.getFallbackBridge(
        'ethereum',
        'polygon',
        'layerzero',
      );

      expect(fallback).toBe('hop');
    });

    it('should return null for stellar', () => {
      const fallback = CompatibilityErrorHandler.getFallbackBridge(
        'ethereum',
        'stellar',
        'stellar',
      );

      expect(fallback).toBe('layerzero');
    });
  });

  describe('buildErrorReport', () => {
    it('should build comprehensive error report', () => {
      const errors: TokenPairValidationError[] = [
        {
          code: TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
          message: 'Chain pair not supported',
          field: 'chainPair',
        },
      ];

      const context = {
        sourceChain: 'ethereum' as const,
        destinationChain: 'stellar' as const,
        sourceToken: 'USDC',
        destinationToken: 'USDC',
        bridge: 'hop' as const,
      };

      const report = CompatibilityErrorHandler.buildErrorReport(errors, context);

      expect(report.isValid).toBe(false);
      expect(report.summary).toContain('ethereum');
      expect(report.summary).toContain('stellar');
      expect(report.errors).toHaveLength(1);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should include fallback recommendation for unsupported chain pair', () => {
      const errors: TokenPairValidationError[] = [
        {
          code: TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
          message: 'Chain pair not supported',
          field: 'chainPair',
        },
      ];

      const context = {
        sourceChain: 'ethereum' as const,
        destinationChain: 'polygon' as const,
        sourceToken: 'USDC',
        destinationToken: 'USDC',
        bridge: 'hop' as const,
      };

      const report = CompatibilityErrorHandler.buildErrorReport(errors, context);

      expect(report.recommendations.some((r) => r.includes('layerzero'))).toBe(true);
    });
  });
});

describe('CompatibilityError', () => {
  it('should create error with all properties', () => {
    const error = new CompatibilityError(
      TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR,
      'tokenPair',
      'Custom message',
      ['Suggestion 1'],
      { key: 'value' },
    );

    expect(error.name).toBe('CompatibilityError');
    expect(error.code).toBe(TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR);
    expect(error.field).toBe('tokenPair');
    expect(error.message).toBe('Custom message');
    expect(error.suggestions).toContain('Suggestion 1');
    expect(error.context).toEqual({ key: 'value' });
  });

  it('should use default message when not provided', () => {
    const error = new CompatibilityError(
      TokenPairErrorCode.BRIDGE_NOT_AVAILABLE,
      'bridgeName',
    );

    expect(error.message).toBe('This bridge is currently unavailable');
  });

  it('should convert to validation error', () => {
    const error = new CompatibilityError(
      TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
      'chainPair',
      'Message',
      ['Suggestion'],
      { key: 'value' },
    );

    const validationError = error.toValidationError();

    expect(validationError.code).toBe(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR);
    expect(validationError.field).toBe('chainPair');
    expect(validationError.suggestions).toContain('Suggestion');
  });

  it('should convert to user-friendly format', () => {
    const error = new CompatibilityError(
      TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
      'chainPair',
    );

    const userFriendly = error.toUserFriendly();

    expect(userFriendly.title).toBe('Route Not Available');
    expect(userFriendly.severity).toBe('error');
  });
});
