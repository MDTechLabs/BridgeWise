```tsx
'use client';

import React from 'react';
import {
  ChainHealth,
  useChainHealth,
  UseChainHealthOptions,
} from '../hooks/useChainHealth';

const STATUS_CONFIG: Record<
  ChainHealth['status'],
  { label: string; color: string; background: string }
> = {
  healthy: {
    label: 'Healthy',
    color: '#166534',
    background: '#dcfce7',
  },
  degraded: {
    label: 'Degraded',
    color: '#92400e',
    background: '#fef3c7',
  },
  down: {
    label: 'Down',
    color: '#991b1b',
    background: '#fee2e2',
  },
};

const BALANCE_CONFIG: Record<
  ChainHealth['relayerBalanceStatus'],
  { color: string; background: string }
> = {
  ok: {
    color: '#166534',
    background: '#dcfce7',
  },
  low: {
    color: '#854d0e',
    background: '#fef9c3',
  },
  critical: {
    color: '#991b1b',
    background: '#fee2e2',
  },
};

const styles = {
  container: {
    width: '100%',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  } as React.CSSProperties,

  chainName: {
    margin: 0,
    fontSize: '15px',
    lineHeight: 1.4,
    fontWeight: 700,
    color: '#0f172a',
  } as React.CSSProperties,

  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    padding: '3px 8px',
    borderRadius: '9999px',
    fontSize: '10px',
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  details: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '8px 16px',
    margin: 0,
    fontSize: '13px',
  } as React.CSSProperties,

  label: {
    color: '#64748b',
  } as React.CSSProperties,

  value: {
    margin: 0,
    color: '#0f172a',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,

  card: {
    padding: '16px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
  } as React.CSSProperties,

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,

  loading: {
    padding: '12px 0',
    fontSize: '13px',
    color: '#64748b',
  } as React.CSSProperties,

  error: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '12px 14px',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    fontSize: '13px',
  } as React.CSSProperties,

  retryButton: {
    padding: '4px 10px',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#991b1b',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,

  alert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '12px',
    padding: '10px 14px',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    fontSize: '13px',
    fontWeight: 600,
  } as React.CSSProperties,

  alertIcon: {
    flexShrink: 0,
  } as React.CSSProperties,

  lastUpdated: {
    marginTop: '12px',
    fontSize: '11px',
    color: '#94a3b8',
  } as React.CSSProperties,
};

function ChainHealthCard({ chain }: { chain: ChainHealth }) {
  const status = STATUS_CONFIG[chain.status];
  const balance = BALANCE_CONFIG[chain.relayerBalanceStatus];

  const blocksBehind = Math.max(
    0,
    chain.chainTipHeight - chain.syncedHeight,
  );

  const syncLabel =
    blocksBehind > 0
      ? `${chain.syncedHeight.toLocaleString()} (${blocksBehind.toLocaleString()} behind)`
      : chain.syncedHeight.toLocaleString();

  return (
    <article style={styles.card} aria-label={`${chain.chainName} health`}>
      <div style={styles.header}>
        <h3 style={styles.chainName}>{chain.chainName}</h3>

        <span
          style={{
            ...styles.statusBadge,
            color: status.color,
            backgroundColor: status.background,
          }}
          aria-label={`Status: ${status.label}`}
        >
          {status.label}
        </span>
      </div>

      <dl style={styles.details}>
        <dt style={styles.label}>RPC latency</dt>
        <dd style={styles.value}>
          {chain.blockLatencyMs.toLocaleString()} ms
        </dd>

        <dt style={styles.label}>Sync height</dt>
        <dd style={styles.value}>{syncLabel}</dd>

        <dt style={styles.label}>Relayer balance</dt>
        <dd
          style={{
            ...styles.value,
            fontWeight: 600,
            color: balance.color,
          }}
          title={`Relayer balance status: ${chain.relayerBalanceStatus}`}
        >
          {chain.relayerBalanceNative.toFixed(3)}{' '}
          {chain.nativeTokenSymbol}
        </dd>
      </dl>
    </article>
  );
}

export interface ChainHealthGridProps {
  /** Passed through to useChainHealth — override to plug in a live telemetry source. */
  options?: UseChainHealthOptions;
}

/**
 * Displays the health of supported bridge chains, including:
 * - RPC latency
 * - Synchronization height
 * - Relayer wallet balance
 *
 * Automatically refreshes through useChainHealth. The refresh interval
 * can be configured through the supplied options.
 */
export function ChainHealthGrid({ options }: ChainHealthGridProps) {
  const {
    chains,
    isLoading,
    error,
    lastUpdated,
    refresh,
  } = useChainHealth(options);

  if (isLoading && chains.length === 0) {
    return (
      <div style={styles.loading} role="status" aria-live="polite">
        Loading chain health…
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.error} role="alert">
        <span>
          Failed to load chain health: {error.message}
        </span>

        <button
          type="button"
          onClick={refresh}
          style={styles.retryButton}
        >
          Retry
        </button>
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div style={styles.loading}>
        No chain health data available.
      </div>
    );
  }

  const criticalChains = chains.filter(
    (chain) => chain.relayerBalanceStatus === 'critical',
  );

  return (
    <section style={styles.container} aria-label="Chain health">
      {criticalChains.length > 0 && (
        <div style={styles.alert} role="alert">
          <span style={styles.alertIcon} aria-hidden="true">
            ⚠
          </span>

          <span>
            {criticalChains.length} relayer wallet
            {criticalChains.length === 1 ? '' : 's'} critically low on gas:{' '}
            {criticalChains.map((chain) => chain.chainName).join(', ')}
          </span>
        </div>
      )}

      <div style={styles.grid}>
        {chains.map((chain) => (
          <ChainHealthCard
            key={chain.chainId}
            chain={chain}
          />
        ))}
      </div>

      {lastUpdated && (
        <div style={styles.lastUpdated}>
          Last updated{' '}
          {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </section>
  );
}
```
