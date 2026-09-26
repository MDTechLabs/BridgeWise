export interface TransferRecord {
  routeId: string;
  asset: string;
  amount: number;
  timestamp: Date;
  success: boolean;
}

export interface VolumeSummary {
  routeId: string;
  totalTransfers: number;
  totalVolume: number;
  successRate: number;
  avgSize: number;
}

const transfers: TransferRecord[] = [];

export function recordTransfer(transfer: TransferRecord): void {
  transfers.push(transfer);
}

export function getVolumeSummary(routeId: string): VolumeSummary | null {
  const matching = transfers.filter(t => t.routeId === routeId);
  if (matching.length === 0) return null;

  const totalVolume = matching.reduce((sum, t) => sum + t.amount, 0);
  const successes = matching.filter(t => t.success).length;

  return {
    routeId,
    totalTransfers: matching.length,
    totalVolume,
    successRate: successes / matching.length,
    avgSize: totalVolume / matching.length,
  };
}

export function getTopRoutes(limit = 5): VolumeSummary[] {
  const routeIds = [...new Set(transfers.map(t => t.routeId))];
  return routeIds
    .map(id => getVolumeSummary(id)!)
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .slice(0, limit);
}

export function clearTransfers(): void {
  transfers.length = 0;
}
