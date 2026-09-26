/**
 * File: apps/dashboard/intelligence/stellar/SorobanBridgeIntelligenceDashboard.tsx
 *
 * Main React component for the Soroban Bridge Intelligence Dashboard.
 *
 * Renders three metric groups (routes / providers / assets), a headline
 * "network health" call-out, and a drill-down side panel that updates as
 * the user selects rows. State is intentionally local — the dashboard
 * is a leaf component with no global selectors.
 */

import React, { useMemo, useState } from 'react';

import { round, trendDirection } from './metrics';
import {
  EMPTY_SNAPSHOT,
  SorobanIntelligenceInput,
  useSorobanIntelligence,
} from './useSorobanIntelligence';
import type { DrillDownTarget } from './types';

const palette = {
  bg: '#0b1020',
  panel: '#11182f',
  border: 'rgba(255,255,255,0.08)',
  text: '#e6edf3',
  muted: '#9aa6b2',
  accent: '#7dd3fc',
  danger: '#fb7185',
  warn: '#fbbf24',
  good: '#34d399',
};

const layoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 24,
  padding: 24,
  background: palette.bg,
  color: palette.text,
  fontFamily: 'system-ui, sans-serif',
};

const cardStyle: React.CSSProperties = {
  background: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 16,
};

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: palette.muted,
  marginBottom: 8,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  color: palette.text,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const headerCellStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `1px solid ${palette.border}`,
  color: palette.muted,
  fontWeight: 500,
};

const rowCellStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: `1px solid ${palette.border}`,
};

const buttonRowStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${palette.border}`,
  borderRadius: 6,
  padding: '6px 10px',
  color: palette.accent,
  cursor: 'pointer',
};

const gridTwoColStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
};

export interface SorobanBridgeIntelligenceDashboardProps {
  /**
   * Optional inputs to inject real data; falls back to mock snapshots.
   * Useful for parent apps that want to wire the live API in later.
   */
  input?: SorobanIntelligenceInput;
  /**
   * Optional drill-down callback that fires when the user clicks a row.
   * Useful when embedding the dashboard inside a larger navigation system.
   */
  onDrillDown?: (target: DrillDownTarget) => void;
  /**
   * Optional initial drill-down selection, useful for deep-linking.
   */
  initialSelection?: DrillDownTarget | null;
}

export function SorobanBridgeIntelligenceDashboard({
  input,
  onDrillDown,
  initialSelection = null,
}: SorobanBridgeIntelligenceDashboardProps) {
  const snapshot = useSorobanIntelligence(input);
  const [selected, setSelected] = useState<DrillDownTarget | null>(
    initialSelection,
  );

  const handleDrillDown = (target: DrillDownTarget) => {
    setSelected(target);
    if (onDrillDown) onDrillDown(target);
  };

  const detail = useMemo(() => {
    if (!selected) return null;
    switch (selected.kind) {
      case 'route':
        return snapshot.routes.find((r) => r.routeId === selected.id) ?? null;
      case 'provider':
        return (
          snapshot.providers.find((p) => p.providerId === selected.id) ?? null
        );
      case 'asset':
        return snapshot.assets.find((a) => a.asset === selected.id) ?? null;
    }
  }, [snapshot, selected]);

  if (snapshot === EMPTY_SNAPSHOT) {
    return (
      <div style={layoutStyle} data-testid="soroban-intel-empty">
        <p>No intelligence data available.</p>
      </div>
    );
  }

  return (
    <div style={layoutStyle} data-testid="soroban-intel-dashboard">
      <HeadlineCard
        networkHealth={snapshot.derived.networkHealth}
        totalVolumeUsd={snapshot.derived.totalVolumeUsd}
        averageSuccessRate={snapshot.derived.averageSuccessRate}
        averageLatencySeconds={snapshot.derived.averageLatencySeconds}
      />

      <div style={gridTwoColStyle}>
        <RouteTable
          routes={snapshot.routes}
          onSelect={(id) => handleDrillDown({ kind: 'route', id })}
        />
        <ProviderTable
          providers={snapshot.providers}
          tiers={snapshot.derived.reliabilityTiers}
          onSelect={(id) => handleDrillDown({ kind: 'provider', id })}
        />
      </div>

      <AssetTable
        assets={snapshot.assets}
        onSelect={(asset) => handleDrillDown({ kind: 'asset', id: asset })}
      />

      <DrillDownPanel
        target={selected}
        detail={detail}
        onClear={() => setSelected(null)}
      />
    </div>
  );
}

interface HeadlineProps {
  networkHealth: number;
  totalVolumeUsd: number;
  averageSuccessRate: number;
  averageLatencySeconds: number;
}

function HeadlineCard({
  networkHealth,
  totalVolumeUsd,
  averageSuccessRate,
  averageLatencySeconds,
}: HeadlineProps) {
  return (
    <section style={cardStyle} aria-label="Network headline">
      <div style={gridTwoColStyle}>
        <Metric
          label="Network Health"
          value={`${(round(networkHealth, 2) * 100).toFixed(0)}%`}
        />
        <Metric label="Total Volume (USD)" value={`$${round(totalVolumeUsd, 0).toLocaleString()}`} />
        <Metric
          label="Avg Success Rate"
          value={`${(round(averageSuccessRate * 100, 2))}%`}
        />
        <Metric
          label="Avg Latency (s)"
          value={`${round(averageLatencySeconds, 0)}s`}
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={headingStyle}>{label}</p>
      <p style={metricValueStyle}>{value}</p>
    </div>
  );
}

interface RouteTableProps {
  routes: ReturnType<typeof useSorobanIntelligence>['routes'];
  onSelect: (routeId: string) => void;
}

function RouteTable({ routes, onSelect }: RouteTableProps) {
  return (
    <section style={cardStyle} aria-label="Route metrics">
      <p style={headingStyle}>Routes</p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerCellStyle}>Route</th>
            <th style={headerCellStyle}>Volume</th>
            <th style={headerCellStyle}>Success</th>
            <th style={headerCellStyle}>Latency</th>
            <th style={headerCellStyle}>Trend</th>
            <th style={headerCellStyle} />
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const trend = trendDirection(route.trend);
            const trendColor =
              trend.direction === 'up'
                ? palette.good
                : trend.direction === 'down'
                ? palette.danger
                : palette.muted;
            return (
              <tr key={route.routeId} data-testid={`route-row-${route.routeId}`}>
                <td style={rowCellStyle}>{route.routeLabel}</td>
                <td style={rowCellStyle}>${route.totalVolumeUsd.toLocaleString()}</td>
                <td style={rowCellStyle}>{(route.successRate * 100).toFixed(1)}%</td>
                <td style={rowCellStyle}>{route.averageLatencySeconds}s</td>
                <td style={{ ...rowCellStyle, color: trendColor }}>
                  {trend.direction} ({trend.delta > 0 ? '+' : ''}
                  {trend.delta}%)
                </td>
                <td style={rowCellStyle}>
                  <button
                    type="button"
                    onClick={() => onSelect(route.routeId)}
                    style={buttonRowStyle}
                    aria-label={`Drill down on ${route.routeLabel}`}
                  >
                    Drill down
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

interface ProviderTableProps {
  providers: ReturnType<typeof useSorobanIntelligence>['providers'];
  tiers: Record<string, 'excellent' | 'good' | 'fair' | 'poor'>;
  onSelect: (providerId: string) => void;
}

function ProviderTable({ providers, tiers, onSelect }: ProviderTableProps) {
  return (
    <section style={cardStyle} aria-label="Provider metrics">
      <p style={headingStyle}>Providers</p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerCellStyle}>Provider</th>
            <th style={headerCellStyle}>Volume</th>
            <th style={headerCellStyle}>Reliability</th>
            <th style={headerCellStyle}>Incidents</th>
            <th style={headerCellStyle} />
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => {
            const tier = tiers[provider.providerId] ?? 'fair';
            const tierColor =
              tier === 'excellent'
                ? palette.good
                : tier === 'good'
                ? palette.accent
                : tier === 'fair'
                ? palette.warn
                : palette.danger;
            return (
              <tr
                key={provider.providerId}
                data-testid={`provider-row-${provider.providerId}`}
              >
                <td style={rowCellStyle}>{provider.providerName}</td>
                <td style={rowCellStyle}>
                  ${provider.totalVolumeUsd.toLocaleString()}
                </td>
                <td style={{ ...rowCellStyle, color: tierColor }}>
                  {(provider.reliabilityScore * 100).toFixed(1)}% ({tier})
                </td>
                <td style={rowCellStyle}>{provider.incidentCount}</td>
                <td style={rowCellStyle}>
                  <button
                    type="button"
                    onClick={() => onSelect(provider.providerId)}
                    style={buttonRowStyle}
                    aria-label={`Drill down on ${provider.providerName}`}
                  >
                    Drill down
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function AssetTable({
  assets,
  onSelect,
}: {
  assets: ReturnType<typeof useSorobanIntelligence>['assets'];
  onSelect: (asset: string) => void;
}) {
  return (
    <section style={cardStyle} aria-label="Asset metrics">
      <p style={headingStyle}>Assets</p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerCellStyle}>Asset</th>
            <th style={headerCellStyle}>Liquidity</th>
            <th style={headerCellStyle}>Bridges</th>
            <th style={headerCellStyle}>Avg Fee</th>
            <th style={headerCellStyle} />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.asset} data-testid={`asset-row-${asset.asset}`}>
              <td style={rowCellStyle}>{asset.asset}</td>
              <td style={rowCellStyle}>
                ${asset.totalLiquidityUsd.toLocaleString()}
              </td>
              <td style={rowCellStyle}>{asset.bridgesUsed.join(', ')}</td>
              <td style={rowCellStyle}>${asset.averageBridgeFeeUsd}</td>
              <td style={rowCellStyle}>
                <button
                  type="button"
                  onClick={() => onSelect(asset.asset)}
                  style={buttonRowStyle}
                  aria-label={`Drill down on ${asset.asset}`}
                >
                  Drill down
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface DrillDownPanelProps {
  target: DrillDownTarget | null;
  detail: unknown;
  onClear: () => void;
}

function DrillDownPanel({ target, detail, onClear }: DrillDownPanelProps) {
  if (!target) {
    return (
      <section style={cardStyle} aria-label="Drill-down empty">
        <p style={headingStyle}>Click any row to drill down.</p>
      </section>
    );
  }

  return (
    <section style={cardStyle} aria-label={`Drill-down ${target.kind}`} data-testid="drill-down-panel">
      <p style={headingStyle}>
        Drill-down · {target.kind} · {target.id}
      </p>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          color: palette.text,
        }}
      >
        {JSON.stringify(detail, null, 2)}
      </pre>
      <button
        type="button"
        onClick={onClear}
        style={{ ...buttonRowStyle, marginTop: 8 }}
        aria-label="Clear drill-down selection"
      >
        Close
      </button>
    </section>
  );
}

export default SorobanBridgeIntelligenceDashboard;
