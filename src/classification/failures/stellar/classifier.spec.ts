import { classifyFailure, classifyFailures } from './classifier';
import { generateSummary, formatSummaryText } from './summarizer';
import { FailureCategory, FailureInput } from './types';

function makeInput(overrides: Partial<FailureInput> = {}): FailureInput {
  return {
    code: 'UNKNOWN',
    title: 'Test Failure',
    message: 'A test failure for unit testing',
    ...overrides,
  };
}

describe('classifyFailure', () => {
  it.each([
    ['INSUFFICIENT_FUNDS', 'INSUFFICIENT_LIQUIDITY'],
    ['ACCOUNT_NOT_FOUND', 'ACCOUNT_ISSUE'],
    ['SEQUENCE_MISMATCH', 'TRANSIENT'],
    ['TRANSACTION_EXPIRED', 'TRANSIENT'],
    ['SOROBAN_INVOCATION_FAILED', 'CONTRACT_ERROR'],
    ['CONTRACT_NOT_FOUND', 'CONTRACT_ERROR'],
    ['INSUFFICIENT_FEE', 'TRANSIENT'],
    ['RATE_LIMIT_EXCEEDED', 'NETWORK_ISSUE'],
    ['NETWORK_UNAVAILABLE', 'NETWORK_ISSUE'],
    ['UNKNOWN', 'UNCLASSIFIED'],
  ] as [string, FailureCategory][])(
    'maps %s to category %s',
    (code, expectedCategory) => {
      const result = classifyFailure(makeInput({ code }));
      expect(result.failureCode).toBe(code);
      expect(result.category).toBe(expectedCategory);
    },
  );

  it('classifies an unrecognised code as UNCLASSIFIED', () => {
    const result = classifyFailure(makeInput({ code: 'SOME_RANDOM_ERROR' }));
    expect(result.category).toBe('UNCLASSIFIED');
  });

  it('uses defaults for optional fields when not provided', () => {
    const result = classifyFailure({ code: 'INSUFFICIENT_FUNDS' });
    expect(result.severity).toBe('medium');
    expect(result.retryable).toBe(false);
    expect(result.title).toBe('Unknown Failure');
    expect(result.message).toBe('');
  });

  it('preserves severity, retryable flag, title and message when provided', () => {
    const result = classifyFailure(
      makeInput({
        code: 'INSUFFICIENT_FUNDS',
        severity: 'high',
        retryable: false,
        title: 'Insufficient Funds',
        message: 'Not enough XLM',
      }),
    );
    expect(result.severity).toBe('high');
    expect(result.retryable).toBe(false);
    expect(result.title).toBe('Insufficient Funds');
    expect(result.message).toBe('Not enough XLM');
  });

  it('includes the transaction hash when present', () => {
    const result = classifyFailure(
      makeInput({ code: 'SEQUENCE_MISMATCH', transactionHash: 'abc123' }),
    );
    expect(result.transactionHash).toBe('abc123');
  });

  it('does not include transactionHash when absent', () => {
    const result = classifyFailure(makeInput());
    expect(result.transactionHash).toBeUndefined();
  });

  it('includes the timestamp when provided', () => {
    const result = classifyFailure(makeInput({ code: 'NETWORK_UNAVAILABLE', timestamp: 5000 }));
    expect(result.timestamp).toBe(5000);
  });
});

describe('classifyFailures', () => {
  it('classifies an array of failure inputs', () => {
    const inputs = [
      makeInput({ code: 'INSUFFICIENT_FUNDS' }),
      makeInput({ code: 'NETWORK_UNAVAILABLE' }),
    ];
    const results = classifyFailures(inputs);
    expect(results).toHaveLength(2);
    expect(results[0].failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(results[1].failureCode).toBe('NETWORK_UNAVAILABLE');
  });

  it('returns an empty array when given no inputs', () => {
    expect(classifyFailures([])).toEqual([]);
  });
});

describe('generateSummary', () => {
  it('aggregates multiple classified failures into a summary', () => {
    const failures = [
      classifyFailure(makeInput({ code: 'INSUFFICIENT_FUNDS', retryable: false })),
      classifyFailure(makeInput({ code: 'SEQUENCE_MISMATCH', retryable: true })),
      classifyFailure(makeInput({ code: 'SEQUENCE_MISMATCH', retryable: true })),
    ];

    const summary = generateSummary(failures);
    expect(summary.totalFailures).toBe(3);
    expect(summary.retryableCount).toBe(2);
    expect(summary.nonRetryableCount).toBe(1);
    expect(summary.categoryBreakdown.INSUFFICIENT_LIQUIDITY).toBe(1);
    expect(summary.categoryBreakdown.TRANSIENT).toBe(2);
    expect(summary.topCategory).toBe('TRANSIENT');
  });

  it('handles an empty failure list', () => {
    const summary = generateSummary([]);
    expect(summary.totalFailures).toBe(0);
    expect(summary.retryableCount).toBe(0);
    expect(summary.nonRetryableCount).toBe(0);
    expect(summary.topCategory).toBe('UNCLASSIFIED');
    expect(summary.recentFailures).toEqual([]);
  });

  it('accepts an explicit time range', () => {
    const failures = [
      classifyFailure(makeInput({ code: 'INSUFFICIENT_FUNDS' })),
    ];
    const range = { start: 1000, end: 2000 };
    const summary = generateSummary(failures, range);
    expect(summary.timeRange.start).toBe(1000);
    expect(summary.timeRange.end).toBe(2000);
  });

  it('includes only the 10 most recent failures in reverse order', () => {
    const failures = Array.from({ length: 15 }, (_, i) =>
      classifyFailure(
        makeInput({
          code: 'SEQUENCE_MISMATCH',
          timestamp: i,
        }),
      ),
    );

    const summary = generateSummary(failures);
    expect(summary.recentFailures).toHaveLength(10);
  });
});

describe('formatSummaryText', () => {
  it('produces a human-readable report string', () => {
    const failures = [
      classifyFailure(makeInput({ code: 'INSUFFICIENT_FUNDS' })),
    ];
    const summary = generateSummary(failures);
    const text = formatSummaryText(summary);

    expect(text).toContain('Failure Report');
    expect(text).toContain('1 total failures');
    expect(text).toContain('INSUFFICIENT_LIQUIDITY');
    expect(text).toContain('Category breakdown');
  });

  it('handles a summary with no failures', () => {
    const summary = generateSummary([]);
    const text = formatSummaryText(summary);
    expect(text).toContain('0 total failures');
  });
});
