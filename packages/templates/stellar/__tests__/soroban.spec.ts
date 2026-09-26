import { SorobanTemplate } from '../src/templates/soroban-template';
import { SorobanExample } from '../src/examples';

describe('Soroban Template Module Pipeline', () => {
  let template: SorobanTemplate;

  beforeEach(() => {
    template = new SorobanTemplate();
  });

  it('should pass default validation suite and run examples without throwing', () => {
    const runner = new SorobanExample();
    const outcome = runner.runExample();
    expect(outcome.success).toBe(true);
    expect(outcome.data?.functionName).toBe('increment');
  });

  it('should flag improperly formatted Soroban contracts gracefully', () => {
    const config = {
      templateType: 'soroban' as const,
      network: 'testnet' as const,
      sourceAccount: 'GBEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
      customConfig: {
        contractId: 'G_INVALID_PREFIX_FOR_SOROBAN_CONTRACT_ADDRESS_FIELD',
        functionName: 'decrement',
      },
    };
    const bugs = template.validate(config);
    expect(
      bugs.some((b) => b.includes('Invalid Soroban contract ID format')),
    ).toBe(true);
  });
});
