import {
  CanaryRolloutRouter,
  CanaryOutcomeMetric,
  CanaryRollbackMetric,
} from './canary-rollout';

interface Message {
  id: string;
}

interface Result {
  success: boolean;
  path: string;
}

describe('CanaryRolloutRouter', () => {
  const stable = jest.fn(async (): Promise<Result> => ({
    success: true,
    path: 'stable',
  }));
  const canary = jest.fn(async (): Promise<Result> => ({
    success: true,
    path: 'canary',
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes all executions through stable by default', async () => {
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary);
    const routed = await router.execute({ id: 'msg-1' });

    expect(routed.path).toBe('stable');
    expect(stable).toHaveBeenCalledTimes(1);
    expect(canary).not.toHaveBeenCalled();
  });

  it('routes 100 percent of traffic to canary when explicitly enabled', async () => {
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary);
    router.setTrafficPercent(100);

    const routed = await router.execute({ id: 'msg-2' });

    expect(routed.path).toBe('canary');
    expect(canary).toHaveBeenCalledTimes(1);
  });

  it('assigns a message ID consistently and records path outcomes', async () => {
    const outcomes: CanaryOutcomeMetric[] = [];
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary, {
      enabled: true,
      trafficPercent: 40,
      onOutcome: (metric) => outcomes.push(metric),
    });
    const firstAssignment = router.isCanary('stable-message-id');

    expect(router.isCanary('stable-message-id')).toBe(firstAssignment);
    const routed = await router.execute({ id: 'stable-message-id' });
    const snapshot = router.getSnapshot();

    expect(routed.path).toBe(firstAssignment ? 'canary' : 'stable');
    expect(outcomes).toHaveLength(1);
    expect(snapshot.stable.attempts + snapshot.canary.attempts).toBe(1);
  });

  it('limits a 10 percent rollout to a stable cohort of the traffic', () => {
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary, {
      enabled: true,
      trafficPercent: 10,
    });
    let canaryAssignments = 0;

    for (let index = 0; index < 1000; index++) {
      if (router.isCanary(`cohort-${index}`)) canaryAssignments++;
    }

    expect(canaryAssignments).toBeGreaterThanOrEqual(50);
    expect(canaryAssignments).toBeLessThanOrEqual(150);
  });

  it('continues execution when the monitoring callback fails', async () => {
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary, {
      onOutcome: () => {
        throw new Error('monitoring unavailable');
      },
    });

    await expect(router.execute({ id: 'monitoring-failure' })).resolves.toMatchObject({
      path: 'stable',
      result: { success: true },
    });
  });

  it('automatically rolls back after the configured canary failure threshold', async () => {
    const rollbackEvents: CanaryRollbackMetric[] = [];
    const failingCanary = jest.fn(async (): Promise<Result> => ({
      success: false,
      path: 'canary',
    }));
    const router = new CanaryRolloutRouter<Message, Result>(stable, failingCanary, {
      enabled: true,
      trafficPercent: 100,
      autoRollback: {
        failureRateThreshold: 0.5,
        minimumSamples: 2,
        sampleWindow: 4,
      },
      onRollback: (metric) => rollbackEvents.push(metric),
    });

    await router.execute({ id: 'failed-1' });
    await router.execute({ id: 'failed-2' });

    expect(router.getSnapshot()).toMatchObject({
      enabled: false,
      trafficPercent: 0,
      rollbackReason: 'automatic_failure_rate_threshold',
      canaryFailureRate: 1,
    });
    expect(rollbackEvents).toEqual([
      { reason: 'automatic_failure_rate_threshold' },
    ]);

    const afterRollback = await router.execute({ id: 'after-rollback' });
    expect(afterRollback.path).toBe('stable');
  });

  it('does not replay a failed canary execution on the stable path', async () => {
    const failingCanary = jest.fn(async () => {
      throw new Error('candidate failed');
    });
    const router = new CanaryRolloutRouter<Message, Result>(stable, failingCanary, {
      enabled: true,
      trafficPercent: 100,
      autoRollback: { minimumSamples: 1, sampleWindow: 1 },
    });

    await expect(router.execute({ id: 'throwing-message' })).rejects.toThrow(
      'candidate failed',
    );

    expect(stable).not.toHaveBeenCalled();
    expect(router.getSnapshot().canary.failures).toBe(1);
    expect(router.getSnapshot().enabled).toBe(false);
  });

  it('rolls back immediately when requested', async () => {
    const rollbackEvents: CanaryRollbackMetric[] = [];
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary, {
      enabled: true,
      trafficPercent: 25,
      onRollback: (metric) => rollbackEvents.push(metric),
    });

    router.rollback('operator');
    await router.execute({ id: 'message-after-rollback' });

    expect(canary).not.toHaveBeenCalled();
    expect(rollbackEvents).toEqual([{ reason: 'operator' }]);
  });

  it('rejects an invalid rollout percentage', () => {
    const router = new CanaryRolloutRouter<Message, Result>(stable, canary);

    expect(() => router.setTrafficPercent(101)).toThrow(RangeError);
    expect(() => router.setTrafficPercent(Number.NaN)).toThrow(RangeError);
  });
});
