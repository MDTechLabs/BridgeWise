import type { SlaComplianceMetrics, SlaComplianceReport } from './types';

function generateReportId(): string {
  return `sla-rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateComplianceReport(
  metrics: SlaComplianceMetrics[],
): SlaComplianceReport {
  const compliant = metrics.filter((m) => m.overallCompliant).map((m) => m.providerId);
  const nonCompliant = metrics.filter((m) => !m.overallCompliant).map((m) => m.providerId);

  const summary =
    nonCompliant.length === 0
      ? `All ${metrics.length} providers are SLA-compliant.`
      : `${nonCompliant.length} of ${metrics.length} providers are not meeting SLA: ${nonCompliant.join(', ')}.`;

  return {
    reportId: generateReportId(),
    generatedAt: new Date(),
    providers: metrics,
    compliantProviders: compliant,
    nonCompliantProviders: nonCompliant,
    summary,
  };
}

export function formatReportAsText(report: SlaComplianceReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════',
    '  SOROBAN PROVIDER SLA COMPLIANCE REPORT',
    '═══════════════════════════════════════════════════',
    `  Report ID : ${report.reportId}`,
    `  Generated : ${report.generatedAt.toISOString()}`,
    '',
    `  Summary   : ${report.summary}`,
    '',
  ];

  for (const m of report.providers) {
    const status = m.overallCompliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT';
    lines.push(`  Provider  : ${m.providerId}  [${status}]`);
    lines.push(`    Period  : ${m.periodStart.toISOString()} → ${m.periodEnd.toISOString()}`);
    lines.push(`    Uptime  : ${m.measuredUptimePercent.toFixed(2)}%  (SLA met: ${m.slaUptimeMet})`);
    lines.push(`    Avg RT  : ${m.avgResponseTimeMs.toFixed(1)} ms  (SLA met: ${m.slaResponseTimeMet})`);
    lines.push(`    P95 RT  : ${m.p95ResponseTimeMs.toFixed(1)} ms`);
    lines.push(`    Reliab. : ${(m.reliability * 100).toFixed(2)}%  (SLA met: ${m.slaReliabilityMet})`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatReportAsJson(report: SlaComplianceReport): string {
  return JSON.stringify(report, null, 2);
}
