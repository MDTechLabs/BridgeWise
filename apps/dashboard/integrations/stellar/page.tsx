import React, { useState } from 'react';

interface IntegrationStatus {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  lastChecked: string;
  latencyMs: number;
}

const MOCK_INTEGRATIONS: IntegrationStatus[] = [
  { provider: 'AllBridge', status: 'healthy', uptime: 99.8, lastChecked: new Date().toISOString(), latencyMs: 210 },
  { provider: 'Squid', status: 'degraded', uptime: 97.2, lastChecked: new Date().toISOString(), latencyMs: 890 },
  { provider: 'Stargate', status: 'healthy', uptime: 99.5, lastChecked: new Date().toISOString(), latencyMs: 180 },
  { provider: 'Wormhole', status: 'down', uptime: 88.1, lastChecked: new Date().toISOString(), latencyMs: 3400 },
  { provider: 'Mayan', status: 'healthy', uptime: 99.9, lastChecked: new Date().toISOString(), latencyMs: 150 },
];

export default function IntegrationHealthDashboard() {
  const [integrations] = useState(MOCK_INTEGRATIONS);

  const color = (s: string) => s === 'healthy' ? '#16a34a' : s === 'degraded' ? '#ca8a04' : '#dc2626';

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Soroban Integration Health Dashboard</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={thStyle}>Provider</th><th style={thStyle}>Status</th>
            <th style={thStyle}>Uptime</th><th style={thStyle}>Latency</th><th style={thStyle}>Last Checked</th>
          </tr>
        </thead>
        <tbody>
          {integrations.map(i => (
            <tr key={i.provider} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={tdStyle}>{i.provider}</td>
              <td style={{ ...tdStyle, color: color(i.status), fontWeight: 600 }}>{i.status.toUpperCase()}</td>
              <td style={tdStyle}>{i.uptime}%</td>
              <td style={tdStyle}>{i.latencyMs}ms</td>
              <td style={tdStyle}>{new Date(i.lastChecked).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: '#4b5563' };
