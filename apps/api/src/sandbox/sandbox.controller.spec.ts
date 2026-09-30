import { Test, TestingModule } from '@nestjs/testing';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { SandboxScenario, SandboxTransactionState } from './sandbox.types';

describe('SandboxController', () => {
  let controller: SandboxController;
  let service: SandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [SandboxService],
    }).compile();

    controller = module.get<SandboxController>(SandboxController);
    service = module.get<SandboxService>(SandboxService);
  });

  describe('getStatus', () => {
    it('returns sandbox status and available scenarios', () => {
      const res = controller.getStatus('partner-test');
      expect(res.sandboxMode).toBe(true);
      expect(res.partnerId).toBe('partner-test');
      expect(res.scenarios).toContain(SandboxScenario.SUCCESS);
    });
  });

  describe('setScenario', () => {
    it('sets the simulation scenario for the partner', () => {
      const res = controller.setScenario(
        { scenario: SandboxScenario.SLIPPAGE_EXCEEDED },
        'partner-test',
      );
      expect(res.activeScenario).toBe(SandboxScenario.SLIPPAGE_EXCEEDED);
    });
  });

  describe('reset', () => {
    it('resets partner sandbox state', () => {
      const res = controller.reset('partner-test');
      expect(res.success).toBe(true);
    });
  });

  describe('getQuote', () => {
    it('returns simulated quote', async () => {
      const quote = await controller.getQuote(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '100',
        },
        'partner-test',
      );

      expect(quote.isSandbox).toBe(true);
      expect(quote.provider).toBe('BridgeWiseSandbox');
    });
  });

  describe('createTransaction and getTransaction', () => {
    it('creates and retrieves simulated transaction', async () => {
      const tx = await controller.createTransaction(
        {
          fromChain: 1001,
          toChain: 1,
          fromToken: 'USDC',
          amount: '75',
          senderAddress: 'ALICE',
          recipientAddress: 'BOB',
        },
        'partner-test',
      );

      expect(tx.id).toMatch(/^sb_tx_/);
      expect(tx.state).toBe(SandboxTransactionState.COMPLETED);

      const found = controller.getTransaction(tx.id, 'partner-test');
      expect(found.id).toBe(tx.id);

      const list = controller.listTransactions('partner-test');
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('mintTokens', () => {
    it('mints test tokens from faucet', () => {
      const res = controller.mintTokens(
        {
          address: 'ADDR123',
          token: 'USDC',
          amount: 500,
        },
        'partner-test',
      );

      expect(res.amount).toBe(500);
      expect(res.token).toBe('USDC');
      expect(res.balance).toBe(500);
    });
  });

  describe('simulateWebhook', () => {
    it('triggers test webhook dispatch', async () => {
      const res = await controller.simulateWebhook(
        {
          webhookUrl: 'https://example.com/webhook',
          eventType: 'transaction.completed',
        },
        'partner-test',
      );

      expect(res.sent).toBe(true);
      expect(res.url).toBe('https://example.com/webhook');
    });
  });
});
