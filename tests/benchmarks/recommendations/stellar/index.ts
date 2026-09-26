import { DatasetGenerator } from './dataset-generator';
import { BenchmarkRunner } from './benchmark-runner';
import { ReportGenerator } from './report-generator';

async function main() {
  console.log('Starting Soroban Route Recommendation Benchmark...');
  
  const datasets = DatasetGenerator.generateAll();
  const runner = new BenchmarkRunner();
  const results = [];

  for (const dataset of datasets) {
    console.log(`Running benchmark for scenario: ${dataset.scenario}...`);
    const metrics = runner.runScenario(dataset);
    results.push(metrics);
    console.log(`[${dataset.scenario}] Accuracy: ${metrics.evaluation.isAccurate ? 'Pass' : 'Fail'} | Avg Time: ${metrics.executionTimeMs.toFixed(4)}ms | Memory: ${metrics.memoryUsedMb.toFixed(4)}MB`);
  }

  const reportContent = ReportGenerator.generateMarkdownReport(results);
  ReportGenerator.writeReport(reportContent);
  
  console.log('Benchmark suite completed successfully.');
}

if (require.main === module) {
  main().catch(console.error);
}
