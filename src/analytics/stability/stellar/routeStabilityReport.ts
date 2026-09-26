import { RouteStabilityAnalyzer } from "./routeStabilityAnalyzer";

export function generateRouteStabilityReport(
  analyzer: RouteStabilityAnalyzer,
  routeId: string
) {
  const report = analyzer.analyze(routeId);

  console.table(report);

  return report;
}