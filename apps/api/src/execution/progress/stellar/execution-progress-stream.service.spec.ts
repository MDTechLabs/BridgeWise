import { firstValueFrom, toArray, take } from 'rxjs';
import { ExecutionProgressStreamService } from './execution-progress-stream.service';
import { ExecutionState } from './execution-progress.types';

describe('ExecutionProgressStreamService', () => {
  let service: ExecutionProgressStreamService;
  beforeEach(() => {
    service = new ExecutionProgressStreamService();
  });

  it('emits lifecycle events with incrementing sequence and a transaction id', () => {
    service.emit('e1', ExecutionState.PENDING);
    service.emit('e1', ExecutionState.SUBMITTED, { transactionId: 'tx-1' });
    const snap = service.getSnapshot('e1');
    expect(snap?.state).toBe(ExecutionState.SUBMITTED);
    expect(snap?.sequence).toBe(2);
    expect(snap?.transactionId).toBe('tx-1');
  });

  it('carries the last known transaction id forward across states', () => {
    service.emit('e1', ExecutionState.SUBMITTED, { transactionId: 'tx-1' });
    service.emit('e1', ExecutionState.CONFIRMING);
    expect(service.getSnapshot('e1')?.transactionId).toBe('tx-1');
  });

  it('lets a consumer subscribe to a single execution', async () => {
    const collected = firstValueFrom(service.streamFor('e1').pipe(take(2), toArray()));
    service.emit('e2', ExecutionState.PENDING); // ignored by e1 subscriber
    service.emit('e1', ExecutionState.PENDING);
    service.emit('e1', ExecutionState.CONFIRMED, { transactionId: 'tx-9' });
    const events = await collected;
    expect(events.map((e) => e.state)).toEqual([ExecutionState.PENDING, ExecutionState.CONFIRMED]);
    expect(events.every((e) => e.executionId === 'e1')).toBe(true);
  });

  it('ignores updates after a terminal state', () => {
    service.emit('e1', ExecutionState.CONFIRMED);
    const after = service.emit('e1', ExecutionState.RECOVERING);
    expect(after).toBeNull();
    expect(service.isTerminal('e1')).toBe(true);
    expect(service.getSnapshot('e1')?.state).toBe(ExecutionState.CONFIRMED);
  });

  it('clears retained state', () => {
    service.emit('e1', ExecutionState.PENDING);
    service.clear('e1');
    expect(service.getSnapshot('e1')).toBeUndefined();
  });
});
