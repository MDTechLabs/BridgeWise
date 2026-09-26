
import React, { useState } from 'react';
import { ProviderAvailability } from '../types';
import { cellColor } from '../utils';

export function HeatmapRow({ data, compact }: { data: ProviderAvailability; compact: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cellW = compact ? 8 : 14;
  const cellGap = compact ? 2 : 3;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
      <div style={{ width: '80px', fontSize: '13px', fontWeight: 600, color: '#1e293b', flexShrink: 0 }}>
        {data.provider}
      </div>

      <div style={{ display: 'flex', gap: `${cellGap}px`, flexWrap: 'nowrap', overflow: 'hidden', position: 'relative' }}>
        {data.slots.map((slot, i) => (
          <div
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: `${cellW}px`,
              height: '24px',
              borderRadius: '3px',
              backgroundColor: cellColor(slot.availability),
              cursor: 'default',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {hovered === i && (
              <div style={{
                position: 'absolute',
                bottom: '28px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}>
                {slot.label}: {(slot.availability * 100).toFixed(2)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ minWidth: '50px', fontSize: '13px', fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>
        {(data.overallAvailability * 100).toFixed(2)}%
      </div>
    </div>
  );
}