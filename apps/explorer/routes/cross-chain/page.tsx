import React, { useState } from 'react';

interface CrossChainRoute {
  id: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  providers: string[];
  avgFeeUsd: number;
  avgLatencyMs: number;
}

const MOCK_ROUTES: CrossChainRoute[] = [
  { id: '1', sourceChain: 'Stellar', destChain: 'Ethereum', asset: 'USDC', providers: ['AllBridge', 'Squid'], avgFeeUsd: 1.50, avgLatencyMs: 4200 },
  { id: '2', sourceChain: 'Stellar', destChain: 'Polygon', asset: 'USDC', providers: ['AllBridge', 'Stargate'], avgFeeUsd: 0.80, avgLatencyMs: 3100 },
  { id: '3', sourceChain: 'Stellar', destChain: 'Base', asset: 'XLM', providers: ['AllBridge'], avgFeeUsd: 0.30, avgLatencyMs: 2800 },
  { id: '4', sourceChain: 'Ethereum', destChain: 'Stellar', asset: 'USDC', providers: ['Squid', 'Wormhole'], avgFeeUsd: 2.10, avgLatencyMs: 6700 },
  { id: '5', sourceChain: 'Polygon', destChain: 'Stellar', asset: 'USDT', providers: ['Stargate'], avgFeeUsd: 0.60, avgLatencyMs: 3500 },
];

export default function CrossChainRouteExplorer() {
  const [routes] = useState(MOCK_ROUTES);
  const [filter, setFilter] = useState('');

  const filtered = filter ? routes.filter(r =>
    r.sourceChain.toLowerCase().includes(filter.toLowerCase()) ||
    r.destChain.toLowerCase().includes(filter.toLowerCase()) ||
    r.asset.toLowerCase().includes(filter.toLowerCase())
  ) : routes;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Soroban Cross-Chain Route Explorer</h1>
      <input placeholder="Search by chain or asset..." value={filter} onChange={e => setFilter(e.target.value)}
        style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, width: 300, marginTop: 12 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={thStyle}>Source</th><th style={thStyle}>Destination</th><th style={thStyle}>Asset</th>
            <th style={thStyle}>Providers</th><th style={thStyle}>Fee</th><th style={thStyle}>Latency</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={tdStyle}>{r.sourceChain}</td><td style={tdStyle}>{r.destChain}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.asset}</td>
              <td style={tdStyle}>{r.providers.join(', ')}</td>
              <td style={tdStyle}>${r.avgFeeUsd.toFixed(2)}</td>
              <td style={tdStyle}>{(r.avgLatencyMs / 1000).toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: '#4b5563' };
