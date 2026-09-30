import { Test, TestingModule } from '@nestjs/testing';
import { SandboxBridgeProvider } from './sandbox-bridge-provider';
import { SandboxService } from './sandbox.service';
import { SandboxScenario } from './sandbox.types';

describe('SandboxBridgeProvider', () => {
  let provider: SandboxBridgeProvider;
  let service: SandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxBridgeProvider, SandboxService],
    }).compile();

    provider = module.get<SandboxBridgeProvider>(SandboxBridgeProvider);
    service = module.get<SandboxService>(SandboxService);
  });

  it('implements BridgeAdapter interface and provides quotes', async () => {
    expect(provider.name).toBe('BridgeWiseSandbox');

    const quote = await provider.getQuote({
      fromChain: 1001,
      toChain: 1,
      fromToken: 'USDC',
      amount: '100',
    });

    expect(quote).not.toBeNull();
    expect(quote?.provider).toBe('BridgeWiseSandbox');
    expect(quote?.fromChain).toBe(1001);
    expect(quote?.toChain).toBe(1);
    expect(parseFloat(quote!.outputAmount)).toBeGreaterThan(0);
  });

  it('returns null when route is unsupported in simulation scenario', async () => {
    service.setPartnerScenario('default', {
      scenario: SandboxScenario.ROUTE_UNAVAILABLE,
    });

    const quote = await provider.getQuote({
      fromChain: 1001,
      toChain: 999,
      fromToken: 'USDC',
      amount: '100',
    });

    expect(quote).toBeNull();
  });
});
