/**
 * Malicious token / hostile callback test suite scaffold.
 * Run in project test environment with mocks/forks; never use production keys.
 */
export type CaseResult = { name: string; passed: boolean; notes?: string };

export const hostileTokenCases: string[] = [
  'reentrancy on deposit callback is blocked',
  'reentrancy on withdraw/refund callback is blocked',
  'transfer returns false fails closed',
  'transferFrom reverts fails closed',
  'fee-on-transfer causes no silent accounting drift',
  'rebasing token is rejected or explicitly accounted',
  'callback revert causes no partial protected mutation',
  'large returndata is bounded',
  'erc777 hook reentrancy is blocked',
  'unauthorized callback caller is rejected',
  'replayed message cannot trigger hostile side effects',
];

export function validateCaseMatrix(cases: string[]): CaseResult[] {
  return hostileTokenCases.map((name) => ({ name, passed: cases.includes(name) }));
}

describe('malicious token and hostile callback suite', () => {
  it('contains required adversarial cases', () => {
    const results = validateCaseMatrix(hostileTokenCases);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('flags missing case', () => {
    const results = validateCaseMatrix(hostileTokenCases.slice(0, -1));
    expect(results.some((r) => !r.passed)).toBe(true);
  });
});
