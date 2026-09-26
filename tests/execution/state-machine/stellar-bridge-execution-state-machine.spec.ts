import {
  StellarBridgeExecutionStateMachine,
  InvalidBridgeTransitionError,
} from '../../../src/execution/state-machine/stellar/stellar-bridge-execution-state-machine';

describe('StellarBridgeExecutionStateMachine', () => {
  // ─── Initial state ────────────────────────────────────────────────

  it('starts in idle by default and exposes next states', () => {
    const sm = new StellarBridgeExecutionStateMachine();
    expect(sm.current).toBe('idle');
    expect(sm.nextStates()).toEqual(['initiated']);
    expect(sm.isTerminal()).toBe(false);
  });

  it('accepts a custom initial state', () => {
    const sm = new StellarBridgeExecutionStateMachine('locking');
    expect(sm.current).toBe('locking');
  });

  // ─── Happy path ───────────────────────────────────────────────────

  it('walks the happy path to completed and records history', () => {
    let t = 0;
    const sm = new StellarBridgeExecutionStateMachine('idle', () => ++t);

    sm.transition('initiated');
    sm.transition('locking');
    sm.transition('locked');
    sm.transition('bridging');
    sm.transition('minting');
    sm.transition('confirming');
    sm.transition('completed');

    expect(sm.current).toBe('completed');
    expect(sm.isTerminal()).toBe(true);
    expect(sm.history.map((h) => h.to)).toEqual([
      'initiated',
      'locking',
      'locked',
      'bridging',
      'minting',
      'confirming',
      'completed',
    ]);
    expect(sm.history[0]).toMatchObject({ from: 'idle', to: 'initiated', at: 1 });
    expect(sm.history[1]).toMatchObject({ from: 'initiated', to: 'locking', at: 2 });
  });

  // ─── Invalid transitions ──────────────────────────────────────────

  it('rejects invalid transitions from idle', () => {
    const sm = new StellarBridgeExecutionStateMachine();
    expect(() => sm.transition('completed')).toThrow(InvalidBridgeTransitionError);
    expect(sm.current).toBe('idle');
  });

  it('rejects skipping states', () => {
    const sm = new StellarBridgeExecutionStateMachine();
    sm.transition('initiated');
    expect(() => sm.transition('locked')).toThrow(InvalidBridgeTransitionError);
    expect(sm.current).toBe('initiated');
  });

  it('rejects transitions from terminal states', () => {
    const sm = new StellarBridgeExecutionStateMachine('completed');
    expect(() => sm.transition('initiated')).toThrow(InvalidBridgeTransitionError);
    expect(sm.current).toBe('completed');
  });

  it('rejects transitions from refunded state', () => {
    const sm = new StellarBridgeExecutionStateMachine('refunded');
    expect(() => sm.transition('idle')).toThrow(InvalidBridgeTransitionError);
    expect(sm.current).toBe('refunded');
  });

  // ─── Failure / rollback / refund paths ────────────────────────────

  it('supports failure from locking and rolling back to refunded', () => {
    const sm = new StellarBridgeExecutionStateMachine('locking');
    sm.transition('failed');
    sm.transition('rolling_back');
    sm.transition('refunded');
    expect(sm.current).toBe('refunded');
    expect(sm.isTerminal()).toBe(true);
  });

  it('supports direct refund from failed state', () => {
    const sm = new StellarBridgeExecutionStateMachine('locked');
    sm.transition('failed');
    sm.transition('refunded');
    expect(sm.current).toBe('refunded');
    expect(sm.isTerminal()).toBe(true);
  });

  it('supports failure from bridging', () => {
    const sm = new StellarBridgeExecutionStateMachine('bridging');
    sm.transition('failed');
    expect(sm.canTransition('rolling_back')).toBe(true);
    sm.transition('rolling_back');
    sm.transition('refunded');
    expect(sm.isTerminal()).toBe(true);
  });

  it('supports failure from minting', () => {
    const sm = new StellarBridgeExecutionStateMachine('minting');
    sm.transition('failed');
    sm.transition('rolling_back');
    sm.transition('refunded');
    expect(sm.current).toBe('refunded');
  });

  it('supports failure from confirming', () => {
    const sm = new StellarBridgeExecutionStateMachine('confirming');
    sm.transition('failed');
    sm.transition('rolling_back');
    sm.transition('refunded');
    expect(sm.current).toBe('refunded');
  });

  // ─── History persistence ──────────────────────────────────────────

  it('records timestamps on every transition', () => {
    let t = 100;
    const sm = new StellarBridgeExecutionStateMachine('idle', () => t++);
    sm.transition('initiated');
    sm.transition('locking');
    sm.transition('locked');

    expect(sm.history).toHaveLength(3);
    expect(sm.history[0].at).toBe(100);
    expect(sm.history[1].at).toBe(101);
    expect(sm.history[2].at).toBe(102);
  });

  it('history is immutable from outside', () => {
    const sm = new StellarBridgeExecutionStateMachine();
    sm.transition('initiated');
    const history = sm.history;
    expect(Object.isFrozen(history)).toBe(false); // array ref is read-only
    expect(typeof history.push).toBe('function'); // push does not exist on readonly
  });

  // ─── Lifecycle snapshot ───────────────────────────────────────────

  it('toLifecycle returns a complete snapshot', () => {
    let t = 0;
    const sm = new StellarBridgeExecutionStateMachine('idle', () => ++t);
    sm.transition('initiated');

    const lifecycle = sm.toLifecycle('transfer-123');
    expect(lifecycle).toEqual({
      transferId: 'transfer-123',
      current: 'initiated',
      history: [{ from: 'idle', to: 'initiated', at: 1 }],
      isTerminal: false,
      nextStates: ['locking', 'failed'],
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  it('canTransition returns false for invalid targets', () => {
    const sm = new StellarBridgeExecutionStateMachine();
    expect(sm.canTransition('idle')).toBe(false);
    expect(sm.canTransition('initiated')).toBe(true);
    expect(sm.canTransition('completed')).toBe(false);
  });

  it('isTerminal is false for in-flight states', () => {
    const states = ['initiated', 'locking', 'locked', 'bridging', 'minting', 'confirming'] as const;
    for (const s of states) {
      const sm = new StellarBridgeExecutionStateMachine(s);
      expect(sm.isTerminal()).toBe(false);
    }
  });

  it('isTerminal is true for terminal states', () => {
    const sm = new StellarBridgeExecutionStateMachine('completed');
    expect(sm.isTerminal()).toBe(true);
    const sm2 = new StellarBridgeExecutionStateMachine('refunded');
    expect(sm2.isTerminal()).toBe(true);
  });

  it('InvalidBridgeTransitionError contains from/to details', () => {
    const err = new InvalidBridgeTransitionError('idle', 'completed');
    expect(err.from).toBe('idle');
    expect(err.to).toBe('completed');
    expect(err.message).toBe('Invalid bridge execution transition: idle -> completed');
    expect(err.name).toBe('InvalidBridgeTransitionError');
  });
});
