import React, { useState, useMemo } from 'react';

interface BridgeableAsset {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  chains: string[];
  totalLiquidityUsd: number;
  avgFeeUsd: number;
  bridgeProviders: string[];
  tags: string[];
}

const MOCK_ASSETS: BridgeableAsset[] = [
  { id: '1', symbol: 'USDC', name: 'USD Coin', chains: ['Stellar', 'Ethereum', 'Polygon', 'Base'], totalLiquidityUsd: 125000000, avgFeeUsd: 0.80, bridgeProviders: ['AllBridge', 'Squid', 'Wormhole'], tags: ['stablecoin'] },
  { id: '2', symbol: 'USDT', name: 'Tether USD', chains: ['Stellar', 'Ethereum', 'Polygon'], totalLiquidityUsd: 98000000, avgFeeUsd: 0.75, bridgeProviders: ['AllBridge', 'Squid'], tags: ['stablecoin'] },
  { id: '3', symbol: 'XLM', name: 'Stellar Lumens', chains: ['Stellar', 'Base', 'Ethereum'], totalLiquidityUsd: 45000000, avgFeeUsd: 0.30, bridgeProviders: ['AllBridge', 'Stargate'], tags: ['native'] },
  { id: '4', symbol: 'ETH', name: 'Ether', chains: ['Stellar', 'Ethereum'], totalLiquidityUsd: 220000000, avgFeeUsd: 3.50, bridgeProviders: ['Wormhole', 'AllBridge'], tags: ['native'] },
  { id: '5', symbol: 'SOL', name: 'Solana', chains: ['Stellar', 'Solana'], totalLiquidityUsd: 67000000, avgFeeUsd: 1.20, bridgeProviders: ['Wormhole'], tags: ['native'] },
  { id: '6', symbol: 'MATIC', name: 'Polygon', chains: ['Stellar', 'Polygon'], totalLiquidityUsd: 31000000, avgFeeUsd: 0.60, bridgeProviders: ['Squid', 'Stargate'], tags: ['native'] },
  { id: '7', symbol: 'DAI', name: 'Dai', chains: ['Stellar', 'Ethereum', 'Polygon'], totalLiquidityUsd: 52000000, avgFeeUsd: 0.65, bridgeProviders: ['AllBridge', 'Squid'], tags: ['stablecoin'] },
  { id: '8', symbol: 'WBTC', name: 'Wrapped Bitcoin', chains: ['Stellar', 'Ethereum'], totalLiquidityUsd: 89000000, avgFeeUsd: 4.20, bridgeProviders: ['Wormhole'], tags: ['wrapped'] },
];

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export default function StellarCrossChainAssetExplorer() {
  const [assets] = useState<BridgeableAsset[]>(MOCK_ASSETS);
  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState('');

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (search && !a.symbol.toLowerCase().includes(search.toLowerCase()) && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (chainFilter && !a.chains.includes(chainFilter)) return false;
      return true;
    });
  }, [assets, search, chainFilter]);

  const allChains = useMemo(() => Array.from(new Set(assets.flatMap((a) => a.chains))).sort(), [assets]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Stellar Cross-Chain Asset Explorer
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Discover bridgeable assets available across chains connected to Stellar.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          placeholder="Search by symbol or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, flex: 1, maxWidth: 320 }}
        />
        <select
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          value={chainFilter}
          onChange={(e) => setChainFilter(e.target.value)}
        >
          <option value="">All chains</option>
          {allChains.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Asset', 'Available Chains', 'Total Liquidity', 'Avg Fee', 'Bridge Providers'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No assets match your search.</td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{a.symbol}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{a.name}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {a.chains.map((c) => (
                        <span key={c} style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, fontSize: 11, color: '#475569' }}>{c}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{formatUsd(a.totalLiquidityUsd)}</td>
                  <td style={{ padding: '10px 12px' }}>${a.avgFeeUsd.toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#475569' }}>{a.bridgeProviders.join(', ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
        Showing {filtered.length} of {assets.length} bridgeable assets.
      </p>
    </div>
  );
}
