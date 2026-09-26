
import React from 'react';
import { ProviderAvailability } from '../types';
import { HeatmapRow } from './HeatmapRow';

export function Heatmap({ data, timeRange }: { data: ProviderAvailability[], timeRange: '7d' | '30d' | '90d' }) {
  const compact = timeRange === '90d';
  const days = parseInt(timeRange.replace('d', ''), 10);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        <div style={{ width: '80px' }} />
        <div style={{ display: 'flex', gap: compact ? '2px' : '3px', flexGrow: 1 }}>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{data[0]?.slots[0]?.label}</div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ fontSize: '11px', color: '#64748b' }}>{data[0]?.slots[days - 1]?.label}</div>
        </div>
        <div style={{ minWidth: '50px', fontSize: '11px', color: '#64748b', textAlign: 'right' }}>Uptime</div>
      </div>

      {data.map(p => <HeatmapRow key={p.provider} data={p} compact={compact} />)}
    </div>
  );
}