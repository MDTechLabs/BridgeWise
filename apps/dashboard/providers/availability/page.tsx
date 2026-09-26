
'use client';

import React, { useState, useMemo } from 'react';
import { DATA } from './data';
import { TimeRange } from './types';
import { Heatmap } from './components/Heatmap';

// ── Main component ───────────────────────────────────────────────────────────

export default function ProviderAvailabilityPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const data = useMemo(() => DATA[timeRange], [timeRange]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>Provider Availability</h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>Uptime and outage history for connected providers.</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: '#e2e8f0', borderRadius: '8px' }}>
            {(['7d', '30d', '90d'] as TimeRange[]).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: timeRange === range ? '#fff' : 'transparent',
                  color: timeRange === range ? '#0f172a' : '#475569',
                  boxShadow: timeRange === range ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {range.replace('d', ' days')}
              </button>
            ))}
          </div>
        </header>

        <main style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <Heatmap data={data} timeRange={timeRange} />
        </main>
      </div>
    </div>
  );
}