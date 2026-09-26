import { describe, beforeEach, it, expect } from 'vitest';
import { StellarBridgeabilityChecker } from './stellar/stellar-bridgeability.checker';

describe('StellarBridgeabilityChecker', () => {
  let checker: StellarBridgeabilityChecker;

  beforeEach(() => {
    checker = new StellarBridgeabilityChecker();
  });

  it('should return isBridgeable=true for valid native XLM transfer', () => {
    const result = checker.check({
      asset: { code: 'XLM' },
      sourceChain: 'stellar',
      targetChain: 'ethereum',
    });

    expect(result.isBridgeable).toBe(true);
  });

  it('should return isBridgeable=false when source and target chains match', () => {
    const result = checker.check({
      asset: { code: 'XLM' },
      sourceChain: 'stellar',
      targetChain: 'stellar',
    });

    expect(result.isBridgeable).toBe(false);
    expect(result.reason).toContain('must be different');
  });

  it('should return isBridgeable=false for unsupported target chain', () => {
    const result = checker.check({
      asset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCI5M4GE323A5452364455533333333333333333' },
      sourceChain: 'stellar',
      targetChain: 'soroban',
    });

    expect(result.isBridgeable).toBe(false);
    expect(result.reason).toContain('is not supported');
  });

  it('should return isBridgeable=false for unlisted issuer', () => {
    const result = checker.check({
      asset: { code: 'USDC', issuer: 'GUNKNOWNISSUERADDRESS' },
      sourceChain: 'stellar',
      targetChain: 'ethereum',
    });

    expect(result.isBridgeable).toBe(false);
    expect(result.reason).toContain('not verified');
  });
});