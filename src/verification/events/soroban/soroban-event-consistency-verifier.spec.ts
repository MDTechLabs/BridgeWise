import {
  ObservedSorobanEvent,
  SorobanEventConsistencyVerifier,
  SorobanEventSpec,
} from './soroban-event-consistency-verifier';

const SPECS: SorobanEventSpec[] = [
  {
    name: 'deposit',
    topic: 'bridge.deposit',
    requiredFields: ['amount', 'recipient'],
    order: 0,
  },
  {
    name: 'settled',
    topic: 'bridge.settled',
    requiredFields: ['amount'],
    order: 1,
  },
  {
    name: 'audit',
    topic: 'bridge.audit',
    requiredFields: [],
    order: 2,
    required: false,
  },
];

function event(
  name: string,
  payload: Record<string, unknown> = { amount: 1, recipient: 'GABC' },
  topic = `bridge.${name}`,
): ObservedSorobanEvent {
  return { name, topic, payload };
}

describe('SorobanEventConsistencyVerifier', () => {
  const verifier = new SorobanEventConsistencyVerifier(SPECS);

  it('accepts a transaction that emits every required event in order', () => {
    const report = verifier.verify([
      event('deposit'),
      event('settled', { amount: 1 }),
    ]);

    expect(report.consistent).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('reports a missing required event', () => {
    const report = verifier.verify([event('deposit')]);

    expect(report.consistent).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('MISSING_REQUIRED_EVENT');
  });

  it('does not require an event marked optional', () => {
    const report = verifier.verify([
      event('deposit'),
      event('settled', { amount: 1 }),
    ]);

    expect(report.issues.map((i) => i.code)).not.toContain(
      'MISSING_REQUIRED_EVENT',
    );
    expect(report.consistent).toBe(true);
  });

  it('reports a duplicated event', () => {
    const report = verifier.verify([
      event('deposit'),
      event('deposit'),
      event('settled', { amount: 1 }),
    ]);

    expect(report.issues.map((i) => i.code)).toContain('DUPLICATE_EVENT');
  });

  it('warns about an unexpected event without failing the set', () => {
    const report = verifier.verify([
      event('deposit'),
      event('settled', { amount: 1 }),
      event('unexpected'),
    ]);

    const issue = report.issues.find((i) => i.code === 'UNEXPECTED_EVENT');
    expect(issue?.severity).toBe('warning');
    expect(report.consistent).toBe(true);
  });

  it('reports a missing required payload field', () => {
    const report = verifier.verify([
      event('deposit', { amount: 1 }),
      event('settled', { amount: 1 }),
    ]);

    const issue = report.issues.find((i) => i.code === 'MISSING_REQUIRED_FIELD');
    expect(issue?.message).toContain('recipient');
    expect(report.consistent).toBe(false);
  });

  it('reports a topic mismatch', () => {
    const report = verifier.verify([
      event('deposit', { amount: 1, recipient: 'GABC' }, 'wrong.topic'),
      event('settled', { amount: 1 }),
    ]);

    expect(report.issues.map((i) => i.code)).toContain('TOPIC_MISMATCH');
    expect(report.consistent).toBe(false);
  });

  it('reports events emitted out of the declared order', () => {
    const report = verifier.verify([
      event('settled', { amount: 1 }),
      event('deposit'),
    ]);

    expect(report.issues.map((i) => i.code)).toContain('EVENT_OUT_OF_ORDER');
  });
});
