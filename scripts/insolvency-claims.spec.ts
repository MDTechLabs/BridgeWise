import { distributeClaims } from './insolvency-claims';

describe('insolvency claim priority', () => {
  it('pays user finalized before fees/operators', () => {
    const payouts = distributeClaims([
      { id: 'fee', class: 'protocol_fee', amount: 50n },
      { id: 'user', class: 'user_finalized', amount: 70n },
      { id: 'op', class: 'operator', amount: 30n },
    ], 80n);
    expect(payouts).toEqual([
      { id: 'user', amount: 70n },
      { id: 'fee', amount: 10n },
      { id: 'op', amount: 0n },
    ]);
  });
});
