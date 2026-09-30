import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, GatewayTimeoutException, NotFoundException } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxScenario, SandboxTransactionState } from './sandbox.types';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxService],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
  });

  describe('Configuration & Scenarios', () => {
    it('returns default config for a new partner', () => {
      const config = service.getPartnerConfig('partner-1');
      expect(config.partnerId).toBe('partner-1');
      expect(config.activeScenario).toBe(SandboxScenario.SUCCESS);
      expect(config.simulatedLatencyMs).toBe(50);
      expect(config.failureRate).toBe(0.0);
    });

    it('updates partner scenario successfully', () => {
      const updated = service.setPartnerScenario('partner-1', {
        scenario: SandboxScenario.INSUFFICIENT_LIQUIDITY,
        simulatedLatencyMs: 10,
        failureRate: 0.2,
      });

      expect(updated.activeScenario).toBe(SandboxScenario.INSUFFICIENT_LIQUIDITY);
      expect(updated.simulatedLatencyMs).toBe(10);
      expect(updated.failureRate).toBe(0.2);
    });

    it('rejects invalid scenario', () => {
      expect(() =>
        service.setPartnerScenario('partner-1', {
          scenario: 'invalid_scenario' as any,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects out-of-range latency and failure rates', () => {
      expect(() =>
        service.setPartnerScenario('partner-1', {
          scenario: SandboxScenario.SUCCESS,
          simulatedLatencyMs: -5,
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.setPartnerScenario('partner-1', {
          scenario: SandboxScenario.SUCCESS,
          failureRate: 1.5,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('Simulated Quotes', () => {
    it('returns valid quote on SUCCESS scenario', async () => {
      const quote = await service.getQuote({
        fromChain: 1001,
        toChain: 1,
        fromToken: 'USDC',
        amount: '100.00',
        scenario: SandboxScenario.SUCCESS,
      });

      expect(quote.isSandbox).toBe(true);
      expect(quote.provider).toBe('BridgeWiseSandbox');
      expect(quote.routeSupported).toBe(true);
      expect(parseFloat(quote.outputAmount)).toBeGreaterThan(0);
      expect(parseFloat(quote.netOutputAmount)).toBeLessThan(100.0);
    });

    it('returns routeSupported: false on ROUTE_UNAVAILABLE scenario', async () => {
      const quote = await service.getQuote({
        fromChain: 1001,
        toChain: 999,
        fromToken: 'USDC',
        amount: '50.00',
        scenario: SandboxScenario.ROUTE_UNAVAILABLE,
      });

      expect(quote.routeSupported).toBe(false);
      expect(quote.error).toContain('unavailable');
    });

    it('returns liquidity error on INSUFFICIENT_LIQUIDITY scenario', async () => {
      const quote = await service.getQuote({
        fromChain: 1001,
        toChain: 1,
        fromToken: 'USDC',
        amount: '1000000.00',
        scenario: SandboxScenario.INSUFFICIENT_LIQUIDITY,
      });

      expect(quote.routeSupported).toBe(true);
      expect(quote.error).toContain('Insufficient simulated liquidity');
    });

    it('throws GatewayTimeoutException on TIMEOUT scenario', async () => {
      await expect(
        service.getQuote({
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '100.00',
          scenario: SandboxScenario.TIMEOUT,
        }),
      ).rejects.toThrow(GatewayTimeoutException);
    });

    it('rejects invalid or non-positive amount', async () => {
      await expect(
        service.getQuote({
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '-5.00',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Simulated Transactions', () => {
    it('creates completed transaction on SUCCESS scenario', async () => {
      const tx = await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '250.00',
          senderAddress: 'GBX...ALICE',
          recipientAddress: '0x123...BOB',
          scenario: SandboxScenario.SUCCESS,
        },
        'partner-1',
      );

      expect(tx.id).toMatch(/^sb_tx_/);
      expect(tx.state).toBe(SandboxTransactionState.COMPLETED);
      expect(tx.sourceTxHash).toMatch(/^0xsb_src_/);
      expect(tx.destinationTxHash).toMatch(/^0xsb_dst_/);
      expect(tx.steps.length).toBe(3);
    });

    it('creates refunded transaction on DESTINATION_REVERT scenario', async () => {
      const tx = await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '500.00',
          senderAddress: 'GBX...ALICE',
          recipientAddress: '0x123...BOB',
          scenario: SandboxScenario.DESTINATION_REVERT,
        },
        'partner-1',
      );

      expect(tx.state).toBe(SandboxTransactionState.REFUNDED);
      expect(tx.failureReason).toContain('Destination bridge execution reverted');
      expect(tx.steps.some((s) => s.status === 'failed')).toBe(true);
    });

    it('creates in-progress transaction on DELAYED_COMPLETION scenario', async () => {
      const tx = await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '100.00',
          senderAddress: 'GBX...ALICE',
          recipientAddress: '0x123...BOB',
          scenario: SandboxScenario.DELAYED_COMPLETION,
        },
        'partner-1',
      );

      expect(tx.state).toBe(SandboxTransactionState.DESTINATION_PROCESSING);
    });

    it('rejects transaction creation on SLIPPAGE_EXCEEDED scenario', async () => {
      await expect(
        service.createTransaction(
          {
            fromChain: 1001,
            toChain: 1,
            fromToken: 'USDC',
            amount: '100.00',
            senderAddress: 'GBX...ALICE',
            recipientAddress: '0x123...BOB',
            scenario: SandboxScenario.SLIPPAGE_EXCEEDED,
          },
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('retrieves created transaction by ID', async () => {
      const created = await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '50.00',
          senderAddress: 'GBX...ALICE',
          recipientAddress: '0x123...BOB',
        },
        'partner-1',
      );

      const found = service.getTransaction(created.id, 'partner-1');
      expect(found.id).toBe(created.id);
    });

    it('throws NotFoundException when querying unknown transaction', () => {
      expect(() => service.getTransaction('sb_tx_non_existent')).toThrow(NotFoundException);
    });

    it('lists transactions for the partner', async () => {
      await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '10.00',
          senderAddress: 'A',
          recipientAddress: 'B',
        },
        'partner-abc',
      );

      const list = service.listTransactions('partner-abc');
      expect(list.length).toBe(1);
      expect(list[0].partnerId).toBe('partner-abc');
    });
  });

  describe('Faucet & State Reset', () => {
    it('mints test tokens to address and tracks balance', () => {
      const receipt = service.mintFaucetTokens('partner-1', {
        address: 'GBX...TEST',
        token: 'USDC',
        amount: 500,
      });

      expect(receipt.amount).toBe(500);
      expect(receipt.balance).toBe(500);
      expect(receipt.txHash).toMatch(/^0xsb_faucet_/);

      const balance = service.getFaucetBalance('partner-1', 'GBX...TEST', 'USDC');
      expect(balance).toBe(500);
    });

    it('rejects unsupported token or invalid faucet amount', () => {
      expect(() =>
        service.mintFaucetTokens('partner-1', {
          address: 'GBX...TEST',
          token: 'FAKE_COIN',
          amount: 100,
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.mintFaucetTokens('partner-1', {
          address: 'GBX...TEST',
          token: 'USDC',
          amount: 200000,
        }),
      ).toThrow(BadRequestException);
    });

    it('resets partner transactions and state cleanly', async () => {
      await service.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '10.00',
          senderAddress: 'A',
          recipientAddress: 'B',
        },
        'partner-reset',
      );

      service.mintFaucetTokens('partner-reset', {
        address: 'ADDR',
        token: 'USDC',
        amount: 250,
      });

      const resetRes = service.resetPartner('partner-reset');
      expect(resetRes.success).toBe(true);
      expect(resetRes.resetCount).toBe(1);

      expect(service.listTransactions('partner-reset').length).toBe(0);
      expect(service.getFaucetBalance('partner-reset', 'ADDR', 'USDC')).toBe(0);
    });
  });

  describe('Status & Webhook Simulation', () => {
    it('returns status info with supported chains and tokens', () => {
      const status = service.getStatus('partner-1');
      expect(status.sandboxMode).toBe(true);
      expect(status.supportedChains.length).toBeGreaterThan(0);
      expect(status.supportedTokens).toContain('USDC');
      expect(status.scenarios).toContain(SandboxScenario.SUCCESS);
    });

    it('simulates webhook event with configured URL', async () => {
      const res = await service.simulateWebhook('partner-1', {
        webhookUrl: 'https://partner.example.com/webhooks/bridge',
        eventType: 'transaction.completed',
      });

      expect(res.sent).toBe(true);
      expect(res.url).toBe('https://partner.example.com/webhooks/bridge');
      expect(res.eventType).toBe('transaction.completed');
    });

    it('handles webhook when no url is provided', async () => {
      const res = await service.simulateWebhook('partner-no-url', {});
      expect(res.sent).toBe(false);
      expect(res.url).toBe('none_configured');
    });
  });
});
