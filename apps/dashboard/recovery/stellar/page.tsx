import React, { useState, useMemo } from 'react';
import { FailedTransfer, RecoveryFilter } from './types';

const MOCK_FAILED_TRANSFERS: FailedTransfer[] = [
  { id: '1', transferHash: 'a1b2c3d4e5f6', sourceChain: 'Stellar', destinationChain: 'Ethereum', asset: 'USDC', amount: '1500.00', failureReason: 'Sequence mismatch', failedAt: '2025-06-27T10:30:00Z', recoveryStatus: 'recovered', retryCount: 2, lastRetryAt: '2025-06-27T10:35:00Z' },
  { id: '2', transferHash: 'b2c3d4e5f6a7', sourceChain: 'Stellar', destinationChain: 'Polygon', asset: 'USDT', amount: '2500.00', failureReason: 'Insufficient liquidity', failedAt: '2025-06-27T11:00:00Z', recoveryStatus: 'pending', retryCount: 0 },
  { id: '3', transferHash: 'c3d4e5f6a7b8', sourceChain: 'Ethereum', destinationChain: 'Stellar', asset: 'ETH', amount: '12.50', failureReason: 'Gas estimation failed', failedAt: '2025-06-27T11:15:00Z', recoveryStatus: 'in_progress', retryCount: 1, lastRetryAt: '2025-06-27T11:20:00Z' },
  { id: '4', transferHash: 'd4e5f6a7b8c9', sourceChain: 'Stellar', destinationChain: 'Base', asset: 'XLM', amount: '5000.00', failureReason: 'Network timeout', failedAt: '2025-06-27T09:45:00Z', recoveryStatus: 'failed', retryCount: 3, lastRetryAt: '2025-06-27T10:00:00Z' },
  { id: '5', transferHash: 'e5f6a7b8c9d0', sourceChain: 'Polygon', destinationChain: 'Stellar', asset: 'USDC', amount: '800.00', failureReason: 'Contract revert', failedAt: '2025-06-27T08:30:00Z', recoveryStatus: 'recovered', retryCount: 1, lastRetryAt: '2025-06-27T08:35:00Z' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  recovered: '#22c55e',
  failed: '#ef4444',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${color}18`, color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {status.replace('_', ' ')}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '16px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', minWidth: 120, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function StellarTransferRecoveryDashboard() {
  const [transfers] = useState<FailedTransfer[]>(MOCK_FAILED_TRANSFERS);
  const [filter, setFilter] = useState<RecoveryFilter>({});

  const filtered = useMemo(() => {
    return transfers.filter((t) => {
      if (filter.status && t.recoveryStatus !== filter.status) return false;
      if (filter.sourceChain && t.sourceChain !== filter.sourceChain) return false;
      if (filter.asset && t.asset !== filter.asset) return false;
      return true;
    });
  }, [transfers, filter]);

  const summary = useMemo(() => {
    return {
      total: filtered.length,
      pending: filtered.filter((t) => t.recoveryStatus === 'pending').length,
      inProgress: filtered.filter((t) => t.recoveryStatus === 'in_progress').length,
      recovered: filtered.filter((t) => t.recoveryStatus === 'recovered').length,
      failed: filtered.filter((t) => t.recoveryStatus === 'failed').length,
    };
  }, [filtered]);

  const chains = Array.from(new Set(transfers.map((t) => t.sourceChain)));
  const assets = Array.from(new Set(transfers.map((t) => t.asset)));
  const statuses = ['pending', 'in_progress', 'recovered', 'failed'];

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Stellar Transfer Recovery Dashboard
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Monitor and manage failed transfer recovery operations.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Total" value={summary.total} color="#0f172a" />
        <SummaryCard label="Pending" value={summary.pending} color="#f59e0b" />
        <SummaryCard label="In Progress" value={summary.inProgress} color="#3b82f6" />
        <SummaryCard label="Recovered" value={summary.recovered} color="#22c55e" />
        <SummaryCard label="Failed" value={summary.failed} color="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <select style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} value={filter.status ?? ''} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value || undefined }))}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} value={filter.sourceChain ?? ''} onChange={(e) => setFilter((f) => ({ ...f, sourceChain: e.target.value || undefined }))}>
          <option value="">All chains</option>
          {chains.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} value={filter.asset ?? ''} onChange={(e) => setFilter((f) => ({ ...f, asset: e.target.value || undefined }))}>
          <option value="">All assets</option>
          {assets.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: '#fff' }} onClick={() => setFilter({})} type="button">Clear filters</button>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Failed Transfers</h2>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No transfers match the filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Transfer Hash', 'Route', 'Asset', 'Amount', 'Failure Reason', 'Status', 'Retries'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{t.transferHash.slice(0, 12)}...</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.sourceChain} &rarr; {t.destinationChain}</td>
                  <td style={{ padding: '10px 12px' }}>{t.asset}</td>
                  <td style={{ padding: '10px 12px' }}>{t.amount}</td>
                  <td style={{ padding: '10px 12px', color: '#ef4444', fontSize: 13 }}>{t.failureReason}</td>
                  <td style={{ padding: '10px 12px' }}><StatusBadge status={t.recoveryStatus} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{t.retryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
