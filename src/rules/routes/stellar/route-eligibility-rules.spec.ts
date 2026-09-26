import { StellarRouteEligibilityRulesFramework } from './route-eligibility-rules';
import { RouteRule, RouteContext } from './types';

const denyUnsupportedChain: RouteRule = {
  id: 'deny-unsupported',
  name: 'Deny unsupported source chains',
  description: 'Only Stellar and Ethereum are supported as source chains.',
  conditions: [{ field: 'sourceChain', operator: 'not_in', value: ['stellar', 'ethereum'] }],
  action: 'deny',
  priority: 100,
  enabled: true,
};

const allowStellarUsdc: RouteRule = {
  id: 'allow-stellar-usdc',
  name: 'Allow Stellar USDC routes',
  description: 'Allow all USDC transfers from Stellar.',
  conditions: [
    { field: 'sourceChain', operator: 'equals', value: 'stellar' },
    { field: 'asset', operator: 'equals', value: 'USDC' },
  ],
  action: 'allow',
  priority: 50,
  enabled: true,
};

const stellarUsdcContext: RouteContext = {
  sourceChain: 'stellar',
  destinationChain: 'ethereum',
  asset: 'USDC',
  amount: '100',
};

const unsupportedContext: RouteContext = {
  sourceChain: 'solana',
  destinationChain: 'ethereum',
  asset: 'USDC',
  amount: '100',
};

describe('StellarRouteEligibilityRulesFramework', () => {
  let framework: StellarRouteEligibilityRulesFramework;

  beforeEach(() => {
    framework = new StellarRouteEligibilityRulesFramework();
  });

  it('allows by default with no rules', () => {
    const result = framework.evaluate(stellarUsdcContext);
    expect(result.eligible).toBe(true);
    expect(result.evaluatedRules).toBe(0);
  });

  it('denies when a deny rule matches', () => {
    framework.addRule(denyUnsupportedChain);
    const result = framework.evaluate(unsupportedContext);
    expect(result.eligible).toBe(false);
    expect(result.appliedRule?.id).toBe('deny-unsupported');
  });

  it('allows when an allow rule matches', () => {
    framework.addRule(denyUnsupportedChain);
    framework.addRule(allowStellarUsdc);
    const result = framework.evaluate(stellarUsdcContext);
    expect(result.eligible).toBe(true);
  });

  it('evaluates in priority order', () => {
    framework.addRule(allowStellarUsdc);
    framework.addRule(denyUnsupportedChain);
    const { result, log } = framework.evaluateWithLog(unsupportedContext);
    expect(result.eligible).toBe(false);
    expect(log[0]!.ruleId).toBe('deny-unsupported');
  });

  it('skips disabled rules', () => {
    framework.addRule({ ...denyUnsupportedChain, enabled: false });
    const result = framework.evaluate(unsupportedContext);
    expect(result.eligible).toBe(true);
  });

  it('removes a rule', () => {
    framework.addRule(denyUnsupportedChain);
    expect(framework.removeRule('deny-unsupported')).toBe(true);
    expect(framework.getRules()).toHaveLength(0);
  });

  it('updates a rule', () => {
    framework.addRule(denyUnsupportedChain);
    expect(framework.updateRule('deny-unsupported', { enabled: false })).toBe(true);
    const result = framework.evaluate(unsupportedContext);
    expect(result.eligible).toBe(true);
  });
});
