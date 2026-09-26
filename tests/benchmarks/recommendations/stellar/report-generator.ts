import * as fs from 'fs';
import * as path from 'path';
import { BenchmarkMetrics } from './benchmark-runner';

export class ReportGenerator {
  static generateMarkdownReport(metrics: BenchmarkMetrics[]): string {
    let report = `# Soroban Route Recommendation Benchmark Report\n\n`;
    report += `Generated at: ${new Date().toISOString()}\n\n`;

    report += `## Summary\n\n`;
    report += `| Scenario | Execution Time (ms) | Peak Memory (MB) | Accuracy |\n`;
    report += `|---|---|---|---|\n`;

    for (const metric of metrics) {
      const accuracyIcon = metric.evaluation.isAccurate ? '✅' : '❌';
      report += `| ${metric.scenario} | ${metric.executionTimeMs.toFixed(4)} | ${metric.memoryUsedMb.toFixed(4)} | ${accuracyIcon} |\n`;
    }

    report += `\n## Detailed Results\n\n`;

    for (const metric of metrics) {
      report += `### Scenario: ${metric.scenario}\n`;
      report += `- **Expected Best Route**: \`${metric.evaluation.expectedBestRouteId}\`\n`;
      report += `- **Actual Best Route**: \`${metric.evaluation.actualBestRouteId || 'None'}\`\n`;
      report += `- **Accuracy**: ${metric.evaluation.isAccurate ? 'Pass' : 'Fail'}\n`;
      
      report += `\n**Score Distribution**:\n`;
      report += `| Route ID | Final Score |\n`;
      report += `|---|---|\n`;
      
      // Sort keys to maintain consistent order
      const sortedKeys = Object.keys(metric.evaluation.scoreDistribution).sort((a, b) => 
        metric.evaluation.scoreDistribution[b] - metric.evaluation.scoreDistribution[a]
      );
      
      for (const routeId of sortedKeys) {
        report += `| \`${routeId}\` | ${metric.evaluation.scoreDistribution[routeId].toFixed(4)} |\n`;
      }
      report += `\n`;
    }

    return report;
  }

  static writeReport(content: string, outputDir: string = __dirname) {
    const filePath = path.join(outputDir, 'benchmark-report.md');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Report generated successfully at: ${filePath}`);
  }
}
