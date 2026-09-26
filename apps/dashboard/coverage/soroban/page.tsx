import React, { useState } from 'react';

interface CoverageEntry {
  asset: string;
  sourceChains: string[];
  destChains: string[];
  bridgeCount: number;
  coveragePercent: number;
}

const MOCK_COVERAGE: CoverageEntry[] = [
  { asset: 'USDC', sourceChains: ['Stellar', 'Ethereum', 'Polygon'], destChains: ['Stellar', 'Ethereum', 'Arbitrum', 'Optimism'], bridgeCount: 4, coveragePercent: 92 },
  { asset: 'USDT', sourceChains: ['Stellar', 'Ethereum'], destChains: ['Stellar', 'Ethereum', 'Polygon'], bridgeCount: 3, coveragePercent: 78 },
  { asset: 'XLM', sourceChains: ['Stellar'], destChains: ['Ethereum', 'Polygon', 'Base'], bridgeCount: 3, coveragePercent: 85 },
  { asset: 'ETH', sourceChains: ['Ethereum', 'Arbitrum', 'Optimism'], destChains: ['Stellar', 'Ethereum'], bridgeCount: 3, coveragePercent: 71 },
  { asset: 'SOL', sourceChains: ['Solana'], destChains: ['Stellar', 'Ethereum'], bridgeCount: 2, coveragePercent: 45 },
];

export default function CoverageDashboard() {
  const [data] = useState(MOCK_COVERAGE);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Soroban Asset Bridging Coverage</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={thStyle}>Asset</th><th style={thStyle}>Source Chains</th>
            <th style={thStyle}>Dest Chains</th><th style={thStyle}>Bridges</th><th style={thStyle}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {data.map(e => (
            <tr key={e.asset} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{e.asset}</td>
              <td style={tdStyle}>{e.sourceChains.join(', ')}</td>
              <td style={tdStyle}>{e.destChains.join(', ')}</td>
              <td style={tdStyle}>{e.bridgeCount}</td>
              <td style={tdStyle}>
                <div style={{ background: '#e5e7eb', borderRadius: 8, height: 20, width: '100%' }}>
                  <div style={{ background: e.coveragePercent > 80 ? '#16a34a' : e.coveragePercent > 60 ? '#ca8a04' : '#dc2626', borderRadius: 8, height: 20, width: `${e.coveragePercent}%`, minWidth: 20 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: '#4b5563' };
