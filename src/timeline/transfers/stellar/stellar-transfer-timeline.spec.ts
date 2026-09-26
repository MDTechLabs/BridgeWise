import { TransferStateMachine } from '../../../transfers/state-machine/stellar';
import type { TransferLifecycle } from '../../../transfers/state-machine/stellar';
import { StellarTransferTimelineGenerator } from './stellar-transfer-timeline';

/**
 * Builds a state machine driven by a caller-controlled clock.
 */
function machineAt(transferId: string, clock: { t: number }): TransferStateMachine {
  return new TransferStateMachine(transferId, () => clock.t);
}

function generatorAt(now: number): StellarTransferTimelineGenerator {
  return new StellarTransferTimelineGenerator({ now: () => now });
}

describe('StellarTransferTimelineGenerator', () => {
  it('produces a single in-flight stage for a lifecycle with no transitions', () => {
    const clock = { t: 1000 };
    const machine = machineAt('tx-empty', clock);

    const timeline = generatorAt(3000).generate(machine.state);

    expect(timeline.stages).toHaveLength(1);
    expect(timeline.stages[0].state).toBe('CREATED');
    expect(timeline.stages[0].enteredAt).toBe(1000);
    expect(timeline.stages[0].isCurrent).toBe(true);
    expect(timeline.isComplete).toBe(false);
    expect(timeline.totalDurationMs).toBe(2000);
  });

  it('derives stage boundaries and durations from consecutive transitions', () => {
    const clock = { t: 1000 };
    const machine = machineAt('tx-durations', clock);

    clock.t = 1500;
    machine.transition('VALIDATING', 'checks started');
    clock.t = 2200;
    machine.transition('ROUTE_SELECTED');

    const timeline = generatorAt(3000).generate(machine.state);

    expect(timeline.stages.map((s) => s.state)).toEqual([
      'CREATED',
      'VALIDATING',
      'ROUTE_SELECTED',
    ]);
    expect(timeline.stages[0].durationMs).toBe(500);
    expect(timeline.stages[0].exitedAt).toBe(1500);
    expect(timeline.stages[1].durationMs).toBe(700);
    expect(timeline.stages[2].durationMs).toBe(800);
    expect(timeline.stages[2].isCurrent).toBe(true);
    expect(timeline.totalDurationMs).toBe(2000);
  });

  it('records the reason attached to a transition', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-reason', clock);

    clock.t = 50;
    machine.transition('VALIDATING', 'checks started');

    const timeline = generatorAt(100).generate(machine.state);

    expect(timeline.stages[1].reason).toBe('checks started');
    expect(timeline.stages[0].reason).toBeUndefined();
  });

  it('indexes stages sequentially from zero', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-index', clock);

    clock.t = 10;
    machine.transition('VALIDATING');
    clock.t = 20;
    machine.transition('ROUTE_SELECTED');

    const timeline = generatorAt(30).generate(machine.state);

    expect(timeline.stages.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('freezes the timeline once a transfer completes', () => {
    const clock = { t: 1000 };
    const machine = machineAt('tx-complete', clock);

    const path = [
      'VALIDATING',
      'ROUTE_SELECTED',
      'BRIDGE_LOCKING',
      'BRIDGE_LOCKED',
      'EXECUTING',
      'COMPLETED',
    ] as const;
    path.forEach((state, i) => {
      clock.t = 1100 + i * 100;
      machine.transition(state);
    });

    const timeline = generatorAt(999999).generate(machine.state);

    expect(timeline.isComplete).toBe(true);
    expect(timeline.stages).toHaveLength(7);
    expect(timeline.endedAt).toBe(1600);
    expect(timeline.totalDurationMs).toBe(600);
    expect(timeline.stages[6].durationMs).toBe(0);
  });

  it('treats REFUNDED as terminal', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-refunded', clock);

    clock.t = 10;
    machine.transition('FAILED');
    clock.t = 20;
    machine.transition('REFUNDED');

    expect(generatorAt(500).generate(machine.state).isComplete).toBe(true);
  });

  it('does not treat FAILED as terminal, since recovery remains possible', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-failed', clock);

    clock.t = 10;
    machine.transition('FAILED', 'bridge timeout');

    const timeline = generatorAt(500).generate(machine.state);

    expect(timeline.isComplete).toBe(false);
    expect(timeline.currentState).toBe('FAILED');
    expect(timeline.stages[1].durationMs).toBe(490);
  });

  it('surfaces a triggered recovery path', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-recovery', clock);

    clock.t = 10;
    machine.transition('FAILED');
    machine.setRecoveryPath('auto-retry');

    const timeline = generatorAt(100).generate(machine.state);

    expect(timeline.recoveryPath?.path).toBe('auto-retry');
  });

  it('omits the recovery path when none was triggered', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-no-recovery', clock);

    expect(generatorAt(100).generate(machine.state).recoveryPath).toBeUndefined();
  });

  it('sorts out-of-order events and never reports negative durations', () => {
    const lifecycle: TransferLifecycle = {
      transferId: 'tx-unsorted',
      currentState: 'ROUTE_SELECTED',
      createdAt: 1000,
      updatedAt: 3000,
      events: [
        { from: 'VALIDATING', to: 'ROUTE_SELECTED', timestamp: 3000 },
        { from: 'CREATED', to: 'VALIDATING', timestamp: 2000 },
      ],
    };

    const timeline = generatorAt(4000).generate(lifecycle);

    expect(timeline.stages.map((s) => s.state)).toEqual([
      'CREATED',
      'VALIDATING',
      'ROUTE_SELECTED',
    ]);
    expect(timeline.stages.every((s) => s.durationMs >= 0)).toBe(true);
  });

  it('does not mutate the lifecycle it is given', () => {
    const clock = { t: 0 };
    const machine = machineAt('tx-immutable', clock);
    clock.t = 10;
    machine.transition('VALIDATING');

    const lifecycle = machine.state;
    const before = JSON.stringify(lifecycle);
    generatorAt(100).generate(lifecycle);

    expect(JSON.stringify(lifecycle)).toBe(before);
  });

  it('rejects a lifecycle without a transferId', () => {
    const lifecycle: TransferLifecycle = {
      transferId: '',
      currentState: 'CREATED',
      createdAt: 0,
      updatedAt: 0,
      events: [],
    };

    expect(() => generatorAt(100).generate(lifecycle)).toThrow(/transferId/);
  });

  describe('render', () => {
    it('marks the active stage and lists every state', () => {
      const clock = { t: 0 };
      const machine = machineAt('tx-render', clock);
      clock.t = 1000;
      machine.transition('VALIDATING', 'checks started');

      const generator = generatorAt(2000);
      const output = generator.render(generator.generate(machine.state));

      expect(output).toContain('tx-render');
      expect(output).toContain('in progress');
      expect(output).toContain('CREATED');
      expect(output).toContain('> [1] VALIDATING');
      expect(output).toContain('checks started');
    });

    it('honours includeReasons and includeDurations', () => {
      const clock = { t: 0 };
      const machine = machineAt('tx-render-opts', clock);
      clock.t = 1000;
      machine.transition('VALIDATING', 'checks started');

      const generator = generatorAt(2000);
      const timeline = generator.generate(machine.state);
      const output = generator.render(timeline, {
        includeReasons: false,
        includeDurations: false,
      });

      expect(output).not.toContain('checks started');
      expect(output).not.toContain('so far');
    });
  });
});