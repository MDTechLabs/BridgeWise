export type Claim = { id: string; class: 'user_finalized' | 'user_inflight' | 'protocol_fee' | 'operator'; amount: bigint };
export type Payout = { id: string; amount: bigint };

const priority: Record<Claim['class'], number> = {
  user_finalized: 1,
  user_inflight: 2,
  protocol_fee: 3,
  operator: 4,
};

export function distributeClaims(claims: Claim[], available: bigint): Payout[] {
  if (available < 0n) throw new Error('available must be non-negative');
  const sorted = [...claims].sort((a, b) => priority[a.class] - priority[b.class]);
  let remaining = available;
  return sorted.map((c) => {
    const amount = c.amount < remaining ? c.amount : remaining;
    remaining -= amount;
    return { id: c.id, amount };
  });
}
