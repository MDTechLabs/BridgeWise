import { TransferStateMachine } from './transfer-state-machine';
import { TransferState } from './types';

describe('TransferStateMachine', () => {
  it('starts in CREATED state', () => {
    const sm = new TransferStateMachine('transfer-1');
    expect(sm.currentState).toBe('CREATED');
    expect(sm.isTerminal()).toBe(false);
  });

  it('walks the happy path to COMPLETED', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('VALIDATING');
    sm.transition('ROUTE_SELECTED');
    sm.transition('BRIDGE_LOCKING');
    sm.transition('BRIDGE_LOCKED');
    sm.transition('EXECUTING');
    sm.transition('COMPLETED');
    expect(sm.currentState).toBe('COMPLETED');
    expect(sm.isTerminal()).toBe(true);
    expect(sm.events).toHaveLength(6);
    expect(sm.events[0]).toMatchObject({ from: 'CREATED', to: 'VALIDATING' });
  });

  it('records events with timestamps', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('VALIDATING', 'Validation started');
    expect(sm.events[0].reason).toBe('Validation started');
    expect(sm.events[0].timestamp).toBeGreaterThan(0);
  });

  it('rejects invalid transitions', () => {
    const sm = new TransferStateMachine('transfer-1');
    expect(() => sm.transition('COMPLETED' as TransferState)).toThrow();
    expect(sm.currentState).toBe('CREATED');
  });

  it('supports the failure and recovery flow', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('VALIDATING');
    sm.transition('ROUTE_SELECTED');
    sm.transition('BRIDGE_LOCKING');
    sm.transition('FAILED');
    expect(sm.currentState).toBe('FAILED');

    const paths = sm.availableRecoveryPaths();
    expect(paths).toContain('auto-retry');
    expect(paths).toContain('fallback-route');
    expect(paths).toContain('manual-intervention');
    expect(paths).toContain('refund');

    sm.setRecoveryPath('auto-retry');
    expect(sm.recoveryPath?.path).toBe('auto-retry');
    expect(sm.recoveryPath?.description).toBeTruthy();
    expect(sm.recoveryPath?.triggeredAt).toBeGreaterThan(0);

    sm.transition('RECOVERING');
    expect(sm.currentState).toBe('RECOVERING');

    sm.transition('EXECUTING');
    sm.transition('COMPLETED');
    expect(sm.isTerminal()).toBe(true);
  });

  it('supports refund from FAILED state', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('FAILED');
    sm.setRecoveryPath('refund');
    sm.transition('REFUNDED');
    expect(sm.isTerminal()).toBe(true);
  });

  it('returns correct next states', () => {
    const sm = new TransferStateMachine('transfer-1');
    expect(sm.nextStates()).toEqual(['VALIDATING', 'FAILED']);
  });

  it('canTransitionTo returns correct boolean', () => {
    const sm = new TransferStateMachine('transfer-1');
    expect(sm.canTransitionTo('VALIDATING')).toBe(true);
    expect(sm.canTransitionTo('COMPLETED')).toBe(false);
  });

  it('reset moves back to CREATED', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('VALIDATING');
    sm.transition('ROUTE_SELECTED');
    sm.reset();
    expect(sm.currentState).toBe('CREATED');
    expect(sm.recoveryPath).toBeUndefined();
  });

  it('returns available recovery paths only for FAILED state', () => {
    const sm = new TransferStateMachine('transfer-1');
    expect(sm.availableRecoveryPaths()).toEqual([]);

    sm.transition('FAILED');
    const paths = sm.availableRecoveryPaths();
    expect(paths).toContain('auto-retry');
    expect(paths).toContain('refund');

    sm.setRecoveryPath('auto-retry');
    sm.transition('RECOVERING');
    expect(sm.availableRecoveryPaths()).toEqual(['refund']);
  });

  it('returns a snapshot of state via getter', () => {
    const sm = new TransferStateMachine('transfer-1');
    sm.transition('VALIDATING');
    const state = sm.state;
    expect(state.transferId).toBe('transfer-1');
    expect(state.currentState).toBe('VALIDATING');
    expect(state.events).toHaveLength(1);
    expect(state.createdAt).toBeGreaterThan(0);
    expect(state.updatedAt).toBeGreaterThan(0);
  });
});
