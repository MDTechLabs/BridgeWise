import { shouldQuarantine } from './token-quarantine';

describe('token quarantine', () => {
  it('quarantines code hash mismatch', () => {
    const d = shouldQuarantine({ token: 'T', chainId: 1, codeHash: '0xnew', behaviorOk: true }, { token: 'T', chainId: 1, approvedCodeHash: '0xold' });
    expect(d.quarantine).toBe(true);
  });

  it('allows approved healthy token', () => {
    const d = shouldQuarantine({ token: 'T', chainId: 1, codeHash: '0xok', behaviorOk: true }, { token: 'T', chainId: 1, approvedCodeHash: '0xok' });
    expect(d.quarantine).toBe(false);
  });
});
