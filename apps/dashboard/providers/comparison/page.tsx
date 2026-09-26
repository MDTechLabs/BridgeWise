import React, { useState, useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'fee' | 'reliability' | 'latency';

interface ProviderMetrics {
  provider: string;
  avgFeeUsd: number;
  feePercent: number;
  reliabilityPercent: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uptimePercent: number;
  supportedAssets: string[];
  chains: string[];
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const PROVIDERS: ProviderMetrics[] = [
  {
    provider: 'AllBridge',
    avgFeeUsd: 1.42,
    feePercent: 0.08,
    reliabilityPercent: 98.4,
    avgLatencyMs: 320,
    p95LatencyMs: 610,
    uptimePercent: 99.7,
    supportedAssets: ['USDC', 'USDT', 'XLM'],
    chains: ['Stellar', 'Ethereum', 'Polygon', 'BSC'],
  },
  {
    provider: 'Squid',
    avgFeeUsd: 2.15,
    feePercent: 0.12,
    reliabilityPercent: 96.1,
    avgLatencyMs: 470,
    p95LatencyMs: 920,
    uptimePercent: 98.1,
    supportedAssets: ['USDC', 'USDT'],
    chains: ['Stellar', 'Ethereum', 'Arbitrum', 'Optimism'],
  },
  {
    provider: 'Stargate',
    avgFeeUsd: 0.98,
    feePercent: 0.06,
    reliabilityPercent: 99.1,
    avgLatencyMs: 215,
    p95LatencyMs: 430,
    uptimePercent: 99.9,
    supportedAssets: ['USDC', 'USDT', 'ETH'],
    chains: ['Stellar', 'Ethereum', 'Arbitrum', 'Polygon', 'BSC'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '4px', height: '8px' }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: '4px', height: '8px' }} />
      </div>
      <span style={{ fontSize: '12px', color: '#374151', minWidth: '52px', textAlign: 'right' }}>
        {label}
      </span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: color + '22',
      color,
      marginRight: '4px',
      marginBottom: '4px',
    }}>
      {text}
    </span>
  );
}

function rank(providers: ProviderMetrics[], key: SortKey): string {
  const sorted = [...providers].sort((a, b) => {
    if (key === 'fee') return a.avgFeeUsd - b.avgFeeUsd;
    if (key === 'reliability') return b.reliabilityPercent - a.reliabilityPercent;
    return a.avgLatencyMs - b.avgLatencyMs;
  });
  return sorted[0]?.provider ?? '';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProviderComparisonDashboard() {
  const [sort, setSort] = useState<SortKey>('reliability');
  const [selected, setSelected] = useState<Set<string>>(new Set(PROVIDERS.map((p) => p.provider)));

  const visible = useMemo(() => {
    const filtered = PROVIDERS.filter((p) => selected.has(p.provider));
    return [...filtered].sort((a, b) => {
      if (sort === 'fee') return a.avgFeeUsd - b.avgFeeUsd;
      if (sort === 'reliability') return b.reliabilityPercent - a.reliabilityPercent;
      return a.avgLatencyMs - b.avgLatencyMs;
    });
  }, [sort, selected]);

  const maxFee = Math.max(...PROVIDERS.map((p) => p.avgFeeUsd));
  const maxLatency = Math.max(...PROVIDERS.map((p) => p.avgLatencyMs));

  const bestFee = rank(PROVIDERS, 'fee');
  const bestReliability = rank(PROVIDERS, 'reliability');
  const bestLatency = rank(PROVIDERS, 'latency');

  function toggleProvider(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { if (next.size > 1) next.delete(name); }
      else next.add(name);
      return next;
    });
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        Soroban Bridge Provider Comparison
      </h1>
      <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
        Compare fees, reliability, and latency across integrated bridge providers.
      </p>

      {/* Winner summary */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {[
          { label: 'Lowest Fee', value: bestFee, color: '#16a34a' },
          { label: 'Most Reliable', value: bestReliability, color: '#6366f1' },
          { label: 'Fastest', value: bestLatency, color: '#0ea5e9' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '12px 16px',
            border: `1px solid ${color}44`,
            borderRadius: '8px',
            backgroundColor: `${color}0a`,
            minWidth: '160px',
          }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['fee', 'reliability', 'latency'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: sort === k ? '#6366f1' : '#e2e8f0',
                backgroundColor: sort === k ? '#6366f1' : '#fff',
                color: sort === k ? '#fff' : '#374151',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.provider}
              onClick={() => toggleProvider(p.provider)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: selected.has(p.provider) ? '#0f172a' : '#e2e8f0',
                backgroundColor: selected.has(p.provider) ? '#0f172a' : '#f8fafc',
                color: selected.has(p.provider) ? '#fff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.provider}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {visible.map((p) => (
          <div
            key={p.provider}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px 20px',
              backgroundColor: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              {/* Left: name + assets */}
              <div style={{ minWidth: '140px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  {p.provider}
                </div>
                <div>
                  {p.supportedAssets.map((a) => (
                    <Badge key={a} text={a} color="#6366f1" />
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  {p.chains.join(' · ')}
                </div>
              </div>

              {/* Right: metrics */}
              <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    Fee — avg ${p.avgFeeUsd.toFixed(2)} ({p.feePercent}%)
                  </div>
                  <Bar value={p.avgFeeUsd} max={maxFee} color="#f97316" label={`$${p.avgFeeUsd.toFixed(2)}`} />
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    Reliability — {p.reliabilityPercent}%
                  </div>
                  <Bar value={p.reliabilityPercent} max={100} color="#16a34a" label={`${p.reliabilityPercent}%`} />
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    Avg latency — {p.avgLatencyMs} ms (p95: {p.p95LatencyMs} ms)
                  </div>
                  <Bar value={p.avgLatencyMs} max={maxLatency} color="#0ea5e9" label={`${p.avgLatencyMs} ms`} />
                </div>

                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Uptime: <strong style={{ color: p.uptimePercent >= 99.5 ? '#16a34a' : '#f97316' }}>
                    {p.uptimePercent}%
                  </strong>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
