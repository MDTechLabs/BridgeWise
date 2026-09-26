type Props = {
  metrics: RouteSLAMetric[];
};

export default function MetricCards({
  metrics,
}: Props) {
  const totalRoutes = metrics.length;

  const avgUptime =
    metrics.reduce(
      (sum, route) =>
        sum + route.uptimePercentage,
      0
    ) / totalRoutes;

  const breaches = metrics.filter(
    route =>
      route.uptimePercentage <
      route.slaTarget
  );

  return (
    <div>
      {/* cards */}
    </div>
  );
}