'use client';

import React from 'react';
import { ChainHealth, useChainHealth, UseChainHealthOptions } from '../hooks/useChainHealth';

const STATUS_COLOR: Record<ChainHealth['status'], string> = {
  healthy: '#16a34a',
  degraded: '#f59e0b',
  down: '#dc2626',
};

const BALANCE_COLOR: Record<ChainHealth['relayerBalanceStatus'], string> = {
  ok: '#16a34a',
  low: '#eab308',
  critical: '#dc2626',
};

function ChainHealthCard({ chain }: { chain: ChainHealth }) {
  const blocksBehind = chain.chainTipHeight - chain.syncedHeight;

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '16px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{chain.chainName}</span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '9999px',
            color: '#fff',
            backgroundColor: STATUS_COLOR[chain.status],
          }}
        >
          {chain.status.toUpperCase()}
        </span>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '6px', fontSize: '13px', margin: 0 }}>
        <dt style={{ color: '#64748b' }}>RPC latency</dt>
        <dd style={{ margin: 0, textAlign: 'right', color: '#0f172a' }}>{chain.blockLatencyMs} ms</dd>

        <dt style={{ color: '#64748b' }}>Sync height</dt>
        <dd style={{ margin: 0, textAlign: 'right', color: '#0f172a' }}>
          {chain.syncedHeight.toLocaleString()}
          {blocksBehind > 0 ? ` (-${blocksBehind})` : ''}
        </dd>

        <dt style={{ color: '#64748b' }}>Relayer balance</dt>
        <dd
          style={{
            margin: 0,
            textAlign: 'right',
            fontWeight: 600,
            color: BALANCE_COLOR[chain.relayerBalanceStatus],
          }}
        >
          {chain.relayerBalanceNative.toFixed(3)} {chain.nativeTokenSymbol}
        </dd>
      </dl>
    </div>
  );
}

export interface ChainHealthGridProps {
  /** Passed through to useChainHealth — override to plug in a live telemetry source. */
  options?: UseChainHealthOptions;
}

/**
 * Visual health panel showing active bridge connections, RPC latency, sync
 * height, and relayer wallet gas balances across all supported chains.
 * Auto-refreshes every 15 seconds by default (configurable via `options`),
 * and flags low/critical relayer gas balances.
 */
export function ChainHealthGrid({ options }: ChainHealthGridProps) {
  const { chains, isLoading, error, lastUpdated, refresh } = useChainHealth(options);

  if (isLoading && chains.length === 0) {
    return <div style={{ fontSize: '13px', color: '#64748b' }}>Loading chain health…</div>;
  }

  if (error) {
    return (
      <div style={{ fontSize: '13px', color: '#dc2626' }}>
        Failed to load chain health: {error.message}{' '}
        <button onClick={refresh} style={{ marginLeft: '8px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  const criticalChains = chains.filter((chain) => chain.relayerBalanceStatus === 'critical');

  return (
    <div>
      {criticalChains.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          ⚠ {criticalChains.length} relayer wallet{criticalChains.length > 1 ? 's' : ''} critically low on
          gas: {criticalChains.map((chain) => chain.chainName).join(', ')}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {chains.map((chain) => (
          <ChainHealthCard key={chain.chainId} chain={chain} />
        ))}
      </div>

      {lastUpdated && (
        <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8' }}>
          Last updated {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
