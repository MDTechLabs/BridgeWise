export interface RouteSLAMetric {
  routeId: string;
  routeName: string;

  uptimePercentage: number;
  slaTarget: number;

  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  lastChecked: string;
}

export interface SLABreach {
  routeId: string;
  routeName: string;

  target: number;
  actual: number;

  timestamp: string;
}