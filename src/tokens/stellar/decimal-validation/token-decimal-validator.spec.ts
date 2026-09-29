import {
  MAX_DECIMALS,
  STELLAR_DECIMALS,
  TokenDecimalValidator,
} from './token-decimal-validator';

describe('TokenDecimalValidator', () => {
  let validator: TokenDecimalValidator;

  beforeEach(() => {
    validator = new TokenDecimalValidator();
  });

  it('accepts a token whose decimals match the assumption', () => {
    const result = validator.validate({
      asset: 'USDC',
      network: 'stellar',
      actualDecimals: STELLAR_DECIMALS,
    });

    expect(result.valid).toBe(true);
    expect(result.code).toBe('DECIMALS_MATCH');
    expect(result.expectedDecimals).toBe(STELLAR_DECIMALS);
  });

  it('is case insensitive when matching assumptions', () => {
    const result = validator.validate({
      asset: 'usdc',
      network: 'stellar',
      actualDecimals: 7,
    });

    expect(result.code).toBe('DECIMALS_MATCH');
  });

  it('rejects a decimal mismatch instead of silently rescaling', () => {
    const result = validator.validate({
      asset: 'USDC',
      network: 'stellar',
      actualDecimals: 6,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('DECIMALS_MISMATCH');
    expect(result.actualDecimals).toBe(6);
    expect(result.expectedDecimals).toBe(7);
  });

  it('reports a missing assumption for an unregistered token', () => {
    const result = validator.validate({
      asset: 'MYSTERY',
      network: 'soroban',
      actualDecimals: 6,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('MISSING_ASSUMPTION');
  });

  it('rejects decimals outside the representable range', () => {
    const result = validator.validate({
      asset: 'USDC',
      network: 'stellar',
      actualDecimals: MAX_DECIMALS + 1,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_DECIMALS');
  });

  it('reports source unavailability rather than guessing', () => {
    const result = validator.validate({
      asset: 'USDC',
      network: 'stellar',
      sourceAvailable: false,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('SOURCE_UNAVAILABLE');
  });

  it('requires an asset name', () => {
    const result = validator.validate({
      asset: '  ',
      network: 'stellar',
      actualDecimals: 7,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('MISSING_ASSUMPTION');
  });

  it('allows callers to override an assumption', () => {
    validator.register({
      asset: 'USDC',
      network: 'evm',
      kind: 'wrapped-evm',
      expectedDecimals: 8,
    });

    const result = validator.validate({
      asset: 'USDC',
      network: 'evm',
      actualDecimals: 8,
    });

    expect(result.valid).toBe(true);
    expect(validator.getAssumption('USDC', 'evm')?.expectedDecimals).toBe(8);
  });

  it('rejects an assumption with invalid decimals', () => {
    expect(() =>
      validator.register({
        asset: 'BAD',
        network: 'evm',
        kind: 'wrapped-evm',
        expectedDecimals: -1,
      }),
    ).toThrow(/Invalid expected decimals/);
  });

  describe('unit conversion', () => {
    it('converts a decimal amount to base units', () => {
      expect(validator.toBaseUnits('1.5', 7)).toBe(15_000_000n);
      expect(validator.toBaseUnits(0.1, 7)).toBe(1_000_000n);
      expect(validator.toBaseUnits('-2', 6)).toBe(-2_000_000n);
    });

    it('rejects amounts with more precision than the token allows', () => {
      expect(() => validator.toBaseUnits('0.00000001', 7)).toThrow(
        /more precision/,
      );
    });

    it('rejects malformed amounts', () => {
      expect(() => validator.toBaseUnits('1e7', 7)).toThrow(/Invalid amount/);
    });

    it('round-trips base units back to an amount string', () => {
      expect(validator.fromBaseUnits(15_000_000n, 7)).toBe('1.5000000');
      expect(validator.fromBaseUnits(-1_000_000n, 7)).toBe('-0.1000000');
      expect(validator.fromBaseUnits(42n, 0)).toBe('42');
    });
  });
});
