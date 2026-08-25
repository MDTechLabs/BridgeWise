export interface StellarAccountSequenceClient {
  getAccountSequence(accountId: string): Promise<string | number>;
}

export interface SequenceState {
  current: bigint;
  next: bigint;
  pending: number;
  refreshedAt: number;
}

export class StellarLedgerSequenceManager {
  private readonly states = new Map<string, SequenceState>();

  constructor(
    private readonly client: StellarAccountSequenceClient,
    private readonly staleAfterMs = 30_000,
  ) {}

  async refresh(accountId: string): Promise<bigint> {
    const current = BigInt(await this.client.getAccountSequence(accountId));
    const state = {
      current,
      next: current + 1n,
      pending: 0,
      refreshedAt: Date.now(),
    };
    this.states.set(accountId, state);
    return current;
  }

  async getCurrent(accountId: string): Promise<bigint> {
    const state = this.states.get(accountId);
    if (!state || this.isStale(accountId)) return this.refresh(accountId);
    return state.current;
  }

  async reserve(accountId: string): Promise<bigint> {
    let state = this.states.get(accountId);
    if (this.isStale(accountId)) {
      await this.refresh(accountId);
      state = this.states.get(accountId)!;
    }
    const sequence = state.next;
    state.next += 1n;
    state.pending += 1;
    return sequence;
  }

  release(accountId: string, sequence: bigint): void {
    const state = this.states.get(accountId);
    if (!state || sequence >= state.next) return;
    state.pending = Math.max(0, state.pending - 1);
  }

  isStale(accountId: string): boolean {
    const state = this.states.get(accountId);
    return !state || Date.now() - state.refreshedAt >= this.staleAfterMs;
  }

  getState(accountId: string): SequenceState | undefined {
    const state = this.states.get(accountId);
    return state && { ...state };
  }
}
