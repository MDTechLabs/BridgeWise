'use client';

import React, { useState, useMemo } from 'react';
import { RouteReliabilityMetric, ReliabilityTrend, RouteFilter } from './types';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_METRICS: RouteReliabilityMetric[] = [
  {
    routeId: 'stellar-eth-usdc',
    sourceChain: 'Stellar',
    destinationChain: 'Ethereum',
    asset: 'USDC',
    successRate: 0.987,
    avgLatencyMs: 4200,
    p95LatencyMs: 8900,
    totalTransfers: 3140,
    failureCount: 41,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'stellar-polygon-usdc',
    sourceChain: 'Stellar',
    destinationChain: 'Polygon',
    asset: 'USDC',
    successRate: 0.963,
    avgLatencyMs: 3100,
    p95LatencyMs: 6200,
    totalTransfers: 1870,
    failureCount: 69,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'stellar-base-xlm',
    sourceChain: 'Stellar',
    destinationChain: 'Base',
    asset: 'XLM',
    successRate: 0.994,
    avgLatencyMs: 2800,
    p95LatencyMs: 5100,
    totalTransfers: 920,
    failureCount: 6,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'eth-stellar-usdc',
    sourceChain: 'Ethereum',
    destinationChain: 'Stellar',
    asset: 'USDC',
    successRate: 0.941,
    avgLatencyMs: 6700,
    p95LatencyMs: 14200,
    totalTransfers: 2310,
    failureCount: 136,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'stellar-arbitrum-usdc',
    sourceChain: 'Stellar',
    destinationChain: 'Arbitrum',
    asset: 'USDC',
    successRate: 0.975,
    avgLatencyMs: 3500,
    p95LatencyMs: 7100,
    totalTransfers: 1450,
    failureCount: 36,
    lastUpdated: new Date().toISOString(),
  },
];

/** Generate 14-day trend data for a given route */
function generateTrends(routeId: string, baseRate: number): ReliabilityTrend[] {
  const trends: ReliabilityTrend[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const jitter = (Math.random() - 0.5) * 0.04;
    trends.push({
      routeId,
      date: d.toISOString().slice(0, 10),
      successRate: Math.min(1, Math.max(0.88, baseRate + jitter)),
      avgLatencyMs: 3000 + Math.round(Math.random() * 4000),
      transferCount: 80 + Math.round(Math.random() * 120),
    });
  }
  return trends;
}

const MOCK_TRENDS: ReliabilityTrend[] = MOCK_METRICS.flatMap((m) =>
  generateTrends(m.routeId, m.successRate),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reliabilityColor(rate: number): string {
  if (rate >= 0.98) return '#22c55e';
  if (rate >= 0.95) return '#f59e0b';
  return '#ef4444';
}

function reliabilityLabel(rate: number): string {
  if (rate >= 0.98) return 'Excellent';
  if (rate >= 0.95) return 'Good';
  if (rate >= 0.90) return 'Fair';
  return 'Poor';
}

function applyFilter(
  metrics: RouteReliabilityMetric[],
  filter: RouteFilter,
): RouteReliabilityMetric[] {
  return metrics.filter((m) => {
    if (filter.sourceChain && m.sourceChain !== filter.sourceChain) return false;
    if (filter.destinationChain && m.destinationChain !== filter.destinationChain) return false;
    if (filter.asset && m.asset !== filter.asset) return false;
    if (filter.minSuccessRate !== undefined && m.successRate < filter.minSuccessRate / 100)
      return false;
    return true;
  });
}

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single summary metric card */
function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        background: '#f8fafc',
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** Horizontal reliability progress bar */
function ReliabilityBar({ rate }: { rate: number }) {
  const color = reliabilityColor(rate);
  const pct = `${(rate * 100).toFixed(0)}%`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
      <div
        style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}
      >
        <div style={{ width: pct, background: color, borderRadius: 4, height: 8 }} />
      </div>
      <span style={{ fontSize: 13, minWidth: 44, color, fontWeight: 600 }}>
        {(rate * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/** Badge showing reliability tier */
function ReliabilityBadge({ rate }: { rate: number }) {
  const color = reliabilityColor(rate);
  const label = reliabilityLabel(rate);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Trend Line Chart (SVG, no library)
// ---------------------------------------------------------------------------

interface TrendChartProps {
  trends: ReliabilityTrend[];
  routeIds: string[];
  routeLabels: Record<string, string>;
}

const TREND_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

function TrendLineChart({ trends, routeIds, routeLabels }: TrendChartProps) {
  const W = 700;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Collect all unique dates (x-axis)
  const dates = Array.from(new Set(trends.map((t) => t.date))).sort();
  if (dates.length < 2 || routeIds.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
        No trend data for the selected filters.
      </div>
    );
  }

  const xScale = (i: number) => PAD.left + (i / (dates.length - 1)) * chartW;
  const yMin = 0.85;
  const yMax = 1.0;
  const yScale = (v: number) => PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  // Y-axis ticks
  const yTicks = [0.85, 0.90, 0.95, 0.98, 1.0];

  // Build polyline points per route
  const lines = routeIds.map((id, colorIdx) => {
    const routeTrends = trends
      .filter((t) => t.routeId === id)
      .sort((a, b) => a.date.localeCompare(b.date));

    const points = routeTrends
      .map((t) => {
        const xi = dates.indexOf(t.date);
        return `${xScale(xi).toFixed(1)},${yScale(t.successRate).toFixed(1)}`;
      })
      .join(' ');

    return { id, points, color: TREND_COLORS[colorIdx % TREND_COLORS.length] };
  });

  // X-axis labels — show every 2nd to avoid crowding
  const xLabels = dates
    .map((d, i) => ({ label: shortDate(d), i }))
    .filter((_, i) => i % 2 === 0 || i === dates.length - 1);

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="Route reliability trend chart"
      role="img"
    >
      {/* Y-axis grid + labels */}
      {yTicks.map((tick) => {
        const y = yScale(tick);
        return (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
              {(tick * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {xLabels.map(({ label, i }) => (
        <text
          key={i}
          x={xScale(i)}
          y={H - PAD.bottom + 16}
          textAnchor="middle"
          fontSize={10}
          fill="#94a3b8"
        >
          {label}
        </text>
      ))}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#e2e8f0" strokeWidth={1} />
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#e2e8f0" strokeWidth={1} />

      {/* Lines per route */}
      {lines.map(({ id, points, color }) => (
        <polyline
          key={id}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filter: RouteFilter;
  chains: string[];
  assets: string[];
  onChange: (f: RouteFilter) => void;
  onClear: () => void;
}

const SELECT_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  color: '#1e293b',
  cursor: 'pointer',
};

function FilterBar({ filter, chains, assets, onChange, onClear }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <select
        style={SELECT_STYLE}
        value={filter.sourceChain ?? ''}
        onChange={(e) => onChange({ ...filter, sourceChain: e.target.value || undefined })}
        aria-label="Filter by source chain"
      >
        <option value="">All source chains</option>
        {chains.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        style={SELECT_STYLE}
        value={filter.destinationChain ?? ''}
        onChange={(e) => onChange({ ...filter, destinationChain: e.target.value || undefined })}
        aria-label="Filter by destination chain"
      >
        <option value="">All destinations</option>
        {chains.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        style={SELECT_STYLE}
        value={filter.asset ?? ''}
        onChange={(e) => onChange({ ...filter, asset: e.target.value || undefined })}
        aria-label="Filter by asset"
      >
        <option value="">All assets</option>
        {assets.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <select
        style={SELECT_STYLE}
        value={filter.minSuccessRate !== undefined ? String(filter.minSuccessRate) : ''}
        onChange={(e) =>
          onChange({ ...filter, minSuccessRate: e.target.value ? Number(e.target.value) : undefined })
        }
        aria-label="Minimum success rate"
      >
        <option value="">Any success rate</option>
        <option value="98">≥ 98% (Excellent)</option>
        <option value="95">≥ 95% (Good+)</option>
        <option value="90">≥ 90% (Fair+)</option>
      </select>

      <button
        style={{
          ...SELECT_STYLE,
          background: '#f1f5f9',
          fontWeight: 500,
          border: '1px solid #cbd5e1',
        }}
        onClick={onClear}
        type="button"
      >
        Clear filters
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RouteReliabilityDashboard() {
  const [filter, setFilter] = useState<RouteFilter>({});
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const filtered = useMemo(() => applyFilter(MOCK_METRICS, filter), [filter]);

  // Aggregate summary metrics
  const summary = useMemo(() => {
    if (filtered.length === 0)
      return { avgRate: 0, totalTransfers: 0, totalFailures: 0, bestRoute: null as RouteReliabilityMetric | null };
    const avgRate = filtered.reduce((s, m) => s + m.successRate, 0) / filtered.length;
    const totalTransfers = filtered.reduce((s, m) => s + m.totalTransfers, 0);
    const totalFailures = filtered.reduce((s, m) => s + m.failureCount, 0);
    const bestRoute = filtered.reduce((best, m) => (m.successRate > best.successRate ? m : best));
    return { avgRate, totalTransfers, totalFailures, bestRoute };
  }, [filtered]);

  // Trend data for filtered routes
  const trendRouteIds = filtered.map((m) => m.routeId);
  const filteredTrends = useMemo(
    () => MOCK_TRENDS.filter((t) => trendRouteIds.includes(t.routeId)),
    [trendRouteIds.join(',')],
  );

  const routeLabels = useMemo(
    () =>
      Object.fromEntries(
        MOCK_METRICS.map((m) => [m.routeId, `${m.sourceChain} → ${m.destinationChain}`]),
      ),
    [],
  );

  // Chains/assets for filter dropdowns
  const chains = useMemo(
    () => Array.from(new Set(MOCK_METRICS.flatMap((m) => [m.sourceChain, m.destinationChain]))).sort(),
    [],
  );
  const assets = useMemo(
    () => Array.from(new Set(MOCK_METRICS.map((m) => m.asset))).sort(),
    [],
  );

  const lastRefreshed = new Date().toLocaleTimeString();

  return (
    <div
      style={{
        padding: '28px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: 1100,
        margin: '0 auto',
        color: '#0f172a',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Route Reliability Dashboard
        </h1>
        <p style={{ color: '#64748b', marginTop: 4, marginBottom: 0, fontSize: 14 }}>
          Stellar cross-chain route performance — success rates, latency, and 14-day trends.
        </p>
      </div>

      {/* Filter bar */}
      <section aria-label="Filters" style={{ marginBottom: 24 }}>
        <FilterBar
          filter={filter}
          chains={chains}
          assets={assets}
          onChange={setFilter}
          onClear={() => setFilter({})}
        />
      </section>

      {/* Summary cards */}
      <section
        aria-label="Summary metrics"
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}
      >
        <MetricCard label="Routes shown" value={String(filtered.length)} sub={`of ${MOCK_METRICS.length} total`} />
        <MetricCard
          label="Avg success rate"
          value={`${(summary.avgRate * 100).toFixed(1)}%`}
          accent={reliabilityColor(summary.avgRate)}
          sub={reliabilityLabel(summary.avgRate)}
        />
        <MetricCard
          label="Total transfers"
          value={summary.totalTransfers.toLocaleString()}
          sub="across filtered routes"
        />
        <MetricCard
          label="Total failures"
          value={summary.totalFailures.toLocaleString()}
          accent={summary.totalFailures > 0 ? '#ef4444' : '#22c55e'}
          sub="filtered routes"
        />
        {summary.bestRoute && (
          <MetricCard
            label="Best route"
            value={`${(summary.bestRoute.successRate * 100).toFixed(1)}%`}
            accent="#22c55e"
            sub={`${summary.bestRoute.sourceChain} → ${summary.bestRoute.destinationChain}`}
          />
        )}
      </section>

      {/* Trend chart */}
      <section
        aria-label="Reliability trends"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 28,
          background: '#fff',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
            14-Day Success Rate Trends
          </h2>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {filtered.map((m, i) => (
              <button
                key={m.routeId}
                type="button"
                onClick={() =>
                  setSelectedRouteId(selectedRouteId === m.routeId ? null : m.routeId)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: selectedRouteId && selectedRouteId !== m.routeId ? '#cbd5e1' : '#334155',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: selectedRouteId === m.routeId ? 700 : 400,
                }}
                aria-pressed={selectedRouteId === m.routeId}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: TREND_COLORS[i % TREND_COLORS.length],
                    flexShrink: 0,
                  }}
                />
                {m.sourceChain} → {m.destinationChain} ({m.asset})
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <TrendLineChart
            trends={filteredTrends}
            routeIds={selectedRouteId ? [selectedRouteId] : trendRouteIds}
            routeLabels={routeLabels}
          />
        </div>
      </section>

      {/* Route metrics table */}
      <section aria-label="Route metrics table">
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              Route Metrics
            </h2>
          </div>

          {filtered.length === 0 ? (
            <div
              style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}
              role="status"
            >
              No routes match the current filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse' }}
                aria-label="Route reliability metrics"
              >
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {[
                      'Route',
                      'Asset',
                      'Status',
                      'Success Rate',
                      'Avg Latency',
                      'P95 Latency',
                      'Transfers',
                      'Failures',
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 12,
                          color: '#64748b',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.routeId}
                      style={{ borderTop: '1px solid #f1f5f9' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = '';
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 14 }}>
                        {m.sourceChain} → {m.destinationChain}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                        {m.asset}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <ReliabilityBadge rate={m.successRate} />
                      </td>
                      <td style={{ padding: '12px 14px', minWidth: 180 }}>
                        <ReliabilityBar rate={m.successRate} />
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {formatLatency(m.avgLatencyMs)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {formatLatency(m.p95LatencyMs)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>
                        {m.totalTransfers.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 13,
                          fontWeight: 600,
                          color: m.failureCount > 100 ? '#ef4444' : m.failureCount > 30 ? '#f59e0b' : '#22c55e',
                        }}
                      >
                        {m.failureCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <p style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
        Last updated: {lastRefreshed} · Data refreshes every 60 s in production.
      </p>
    </div>
  );
}
