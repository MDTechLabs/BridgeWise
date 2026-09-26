import { MevProtector } from '../../src/core/security/mev-protector';
import { SlippageCalculator } from '../../src/core/security/slippage-calculator';

describe('Dynamic Slippage Guard & MEV Protection Tests (#715)', () => {
  let slippageCalculator: SlippageCalculator;
  let mevProtector: MevProtector;

  beforeEach(() => {
    slippageCalculator = new SlippageCalculator();
    mevProtector = new MevProtector();
  });

  describe('SlippageCalculator', () => {
    it('should dynamically calculate slippage within [0.1%, 3.0%] bounds', () => {
      // Normal transaction
      const resNormal = slippageCalculator.calculateSlippage({
        transactionSizeUsd: 100,
        poolDepthUsd: 100000,
        volatilityIndex: 0.01,
      });
      expect(resNormal.recommendedSlippagePercent).toBeGreaterThanOrEqual(0.1);
      expect(resNormal.recommendedSlippagePercent).toBeLessThanOrEqual(3.0);
      expect(resNormal.circuitBreakerTriggered).toBe(false);

      // Small tx, zero volatility -> minimum floor 0.1%
      const resLow = slippageCalculator.calculateSlippage({
        transactionSizeUsd: 1,
        poolDepthUsd: 1000000,
        volatilityIndex: 0.0,
      });
      expect(resLow.recommendedSlippagePercent).toBe(0.5);

      // High volatility + large tx -> capped at 3.0%
      const resHigh = slippageCalculator.calculateSlippage({
        transactionSizeUsd: 50000,
        poolDepthUsd: 100000,
        volatilityIndex: 0.9,
      });
      expect(resHigh.recommendedSlippagePercent).toBe(3.0);
    });

    it('should trigger emergency circuit breaker when pool depth drops below threshold', () => {
      const resCircuit = slippageCalculator.calculateSlippage({
        transactionSizeUsd: 500,
        poolDepthUsd: 2000, // Below default threshold of $10,000
      });
      expect(resCircuit.circuitBreakerTriggered).toBe(true);
      expect(resCircuit.recommendedSlippagePercent).toBe(3.0);
      expect(resCircuit.reason).toContain('liquidity threshold');
    });
  });

  describe('MevProtector', () => {
    it('should route through private RPC endpoints for high-value trades (>= $10,000 USD)', () => {
      const result = mevProtector.selectRpcEndpoint({
        transactionValueUsd: 15000,
        publicRpcUrl: 'https://eth-mainnet.public.blastapi.io',
        chain: 'ethereum',
      });

      expect(result.isPrivateRpc).toBe(true);
      expect(result.selectedRpcUrl).toBe('https://rpc.flashbots.net');
      expect(result.providerName).toContain('Flashbots/MEV-Blocker');
    });

    it('should use public RPC for low-value trades (< $10,000 USD)', () => {
      const result = mevProtector.selectRpcEndpoint({
        transactionValueUsd: 500,
        publicRpcUrl: 'https://eth-mainnet.public.blastapi.io',
        chain: 'ethereum',
      });

      expect(result.isPrivateRpc).toBe(false);
      expect(result.selectedRpcUrl).toBe('https://eth-mainnet.public.blastapi.io');
    });

    it('should fall back to public RPC if private RPC is disabled or unsupported for chain', () => {
      const resultDisabled = mevProtector.selectRpcEndpoint({
        transactionValueUsd: 20000,
        publicRpcUrl: 'https://eth-mainnet.public.blastapi.io',
        chain: 'ethereum',
        enableMevProtection: false,
      });
      expect(resultDisabled.isPrivateRpc).toBe(false);

      const resultUnsupported = mevProtector.selectRpcEndpoint({
        transactionValueUsd: 20000,
        publicRpcUrl: 'https://custom-chain-rpc.io',
        chain: 'unknownchain',
      });
      expect(resultUnsupported.isPrivateRpc).toBe(false);
    });
  });
});
