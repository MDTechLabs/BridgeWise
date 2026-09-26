import MetricCards from "./components/MetricCards";
import UptimeChart from "./components/UptimeChart";
import RouteHealthTable from "./components/RouteHealthTable";
import BreachList from "./components/BreachList";

export default async function SLADashboardPage() {
  const metrics = await getRouteMetrics();

  return (
    <div className="space-y-6">
      <h1>Stellar Route SLA Dashboard</h1>

      <MetricCards metrics={metrics} />

      <UptimeChart metrics={metrics} />

      <RouteHealthTable metrics={metrics} />

      <BreachList metrics={metrics} />
    </div>
  );
}