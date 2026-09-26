import { ClassifiedFailure, FailureCategory, FailureSummary } from './types';

export function generateSummary(
  failures: ClassifiedFailure[],
  timeRange?: { start: number; end: number },
): FailureSummary {
  const breakdown: Record<FailureCategory, number> = {
    INSUFFICIENT_LIQUIDITY: 0,
    ACCOUNT_ISSUE: 0,
    TRANSIENT: 0,
    CONTRACT_ERROR: 0,
    NETWORK_ISSUE: 0,
    UNCLASSIFIED: 0,
  };

  let retryableCount = 0;
  let nonRetryableCount = 0;

  for (const f of failures) {
    breakdown[f.category] = (breakdown[f.category] ?? 0) + 1;
    if (f.retryable) retryableCount++;
    else nonRetryableCount++;
  }

  const timestamps = failures.map((f) => f.timestamp);
  const start = timeRange?.start ?? (timestamps.length > 0 ? Math.min(...timestamps) : Date.now());
  const end = timeRange?.end ?? (timestamps.length > 0 ? Math.max(...timestamps) : Date.now());

  let topCategory: FailureCategory = 'UNCLASSIFIED';
  let topCount = 0;
  for (const entry of Object.entries(breakdown)) {
    const cat = entry[0] as FailureCategory;
    const count = entry[1];
    if (count > topCount) {
      topCount = count;
      topCategory = cat;
    }
  }

  return {
    totalFailures: failures.length,
    categoryBreakdown: breakdown,
    retryableCount,
    nonRetryableCount,
    timeRange: { start, end },
    topCategory,
    recentFailures: failures.slice(-10).reverse(),
  };
}

export function formatSummaryText(summary: FailureSummary): string {
  const lines: string[] = [
    `Failure Report - ${summary.totalFailures} total failures`,
    `  Top Category    : ${summary.topCategory}`,
    `  Retryable       : ${summary.retryableCount}`,
    `  Non-retryable   : ${summary.nonRetryableCount}`,
    `  Time range      : ${new Date(summary.timeRange.start).toISOString()} - ${new Date(summary.timeRange.end).toISOString()}`,
    `  Category breakdown:`,
  ];

  for (const entry of Object.entries(summary.categoryBreakdown)) {
    const cat = entry[0];
    const count = entry[1];
    if (count > 0) {
      lines.push(`    ${cat}: ${count}`);
    }
  }

  return lines.join('\n');
}
