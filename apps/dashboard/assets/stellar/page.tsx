'use client';

import React, { useEffect, useMemo, useState } from 'react';

type VerificationStatus = 'verified' | 'unverified' | 'failed';
type TomlStatus = 'matched' | 'missing' | 'mismatch' | 'not_checked' | 'native';

interface StellarAssetVerification {
  assetCode: string;
  assetName: string;
  issuer: string | null;
  homeDomain: string | null;
  tomlStatus: TomlStatus;
  decimals: number;
  status: VerificationStatus;
  checkedAt: string | null;
  reason: string;
}

interface FilterState {
  status: 'all' | VerificationStatus;
  query: string;
}

interface VerificationSummary {
  total: number;
  verified: number;
  unverified: number;
  failed: number;
}

interface StellarAssetDiscoveryRecord {
  symbol: string;
  name: string;
  issuer: string | null;
  decimals: number;
  isNative: boolean;
}

const DEFAULT_ASSET_DISCOVERY_ENDPOINT = '/assets/discovery/stellar';

const INITIAL_VERIFICATION_RESULTS: StellarAssetVerification[] = [
  {
    assetCode: 'XLM',
    assetName: 'Stellar Lumens',
    issuer: null,
    homeDomain: null,
    tomlStatus: 'native',
    decimals: 7,
    status: 'verified',
    checkedAt: null,
    reason: 'Native Stellar asset. No issuer account is required.',
  },
  {
    assetCode: 'USDC',
    assetName: 'USD Coin',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    homeDomain: null,
    tomlStatus: 'not_checked',
    decimals: 7,
    status: 'unverified',
    checkedAt: null,
    reason: 'No verification result has been loaded for this issuer.',
  },
  {
    assetCode: 'yXLM',
    assetName: 'Yield XLM',
    issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
    homeDomain: null,
    tomlStatus: 'not_checked',
    decimals: 7,
    status: 'unverified',
    checkedAt: null,
    reason: 'No verification result has been loaded for this issuer.',
  },
];

const STATUS_OPTIONS: FilterState['status'][] = ['all', 'verified', 'unverified', 'failed'];

const statusStyles: Record<VerificationStatus, React.CSSProperties> = {
  verified: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  unverified: { background: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' },
  failed: { background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' },
};

const tomlLabels: Record<TomlStatus, string> = {
  matched: 'Matched',
  missing: 'Missing',
  mismatch: 'Mismatch',
  not_checked: 'Not checked',
  native: 'Native',
};

function getVerificationEndpoint(): string {
  return process.env.NEXT_PUBLIC_STELLAR_ASSET_VERIFICATION_URL ?? '';
}

function getAssetDiscoveryEndpoint(): string {
  const configuredEndpoint = process.env.NEXT_PUBLIC_STELLAR_ASSET_DISCOVERY_URL;
  if (configuredEndpoint) return configuredEndpoint;

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  return `${apiBaseUrl}${DEFAULT_ASSET_DISCOVERY_ENDPOINT}`;
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return value === 'verified' || value === 'unverified' || value === 'failed';
}

function isTomlStatus(value: unknown): value is TomlStatus {
  return value === 'matched' || value === 'missing' || value === 'mismatch' || value === 'not_checked' || value === 'native';
}

function normalizeVerificationResult(value: unknown): StellarAssetVerification | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StellarAssetVerification>;
  if (typeof record.assetCode !== 'string' || typeof record.assetName !== 'string') return null;
  if (!isVerificationStatus(record.status) || !isTomlStatus(record.tomlStatus)) return null;
  if (typeof record.decimals !== 'number' || !Number.isInteger(record.decimals)) return null;
  if (record.issuer !== null && typeof record.issuer !== 'string') return null;
  if (record.homeDomain !== null && typeof record.homeDomain !== 'string') return null;
  if (record.checkedAt !== null && typeof record.checkedAt !== 'string') return null;
  if (typeof record.reason !== 'string') return null;

  return {
    assetCode: record.assetCode,
    assetName: record.assetName,
    issuer: record.issuer,
    homeDomain: record.homeDomain,
    tomlStatus: record.tomlStatus,
    decimals: record.decimals,
    status: record.status,
    checkedAt: record.checkedAt,
    reason: record.reason,
  };
}

function normalizeVerificationResponse(payload: unknown): StellarAssetVerification[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : [];

  return records
    .map(normalizeVerificationResult)
    .filter((record): record is StellarAssetVerification => record !== null);
}

function normalizeDiscoveryRecord(value: unknown): StellarAssetDiscoveryRecord | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StellarAssetDiscoveryRecord>;
  if (typeof record.symbol !== 'string' || typeof record.name !== 'string') return null;
  if (record.issuer !== null && typeof record.issuer !== 'string') return null;
  if (typeof record.decimals !== 'number' || !Number.isInteger(record.decimals)) return null;
  if (typeof record.isNative !== 'boolean') return null;

  return {
    symbol: record.symbol,
    name: record.name,
    issuer: record.issuer,
    decimals: record.decimals,
    isNative: record.isNative,
  };
}

function normalizeDiscoveryResponse(payload: unknown): StellarAssetVerification[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map(normalizeDiscoveryRecord)
    .filter((record): record is StellarAssetDiscoveryRecord => record !== null)
    .map((asset) => ({
      assetCode: asset.symbol,
      assetName: asset.name,
      issuer: asset.issuer,
      homeDomain: null,
      tomlStatus: asset.isNative ? 'native' : 'not_checked',
      decimals: asset.decimals,
      status: asset.isNative ? 'verified' : 'unverified',
      checkedAt: null,
      reason: asset.isNative
        ? 'Native Stellar asset. No issuer account is required.'
        : 'Asset is known by discovery but no verification result has been loaded for this issuer.',
    }));
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not checked';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function matchesQuery(asset: StellarAssetVerification, query: string): boolean {
  if (!query) return true;

  const normalizedQuery = query.toLowerCase();
  return [
    asset.assetCode,
    asset.assetName,
    asset.issuer ?? '',
    asset.homeDomain ?? '',
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function filterAssets(
  assets: StellarAssetVerification[],
  filters: FilterState,
): StellarAssetVerification[] {
  const query = filters.query.trim();

  return assets.filter((asset) => {
    const statusMatch = filters.status === 'all' || asset.status === filters.status;
    return statusMatch && matchesQuery(asset, query);
  });
}

function summarizeAssets(assets: StellarAssetVerification[]): VerificationSummary {
  return assets.reduce(
    (summary, asset) => {
      summary.total += 1;
      summary[asset.status] += 1;
      return summary;
    },
    { total: 0, verified: 0, unverified: 0, failed: 0 },
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', minWidth: '140px', flex: 1 }}>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', border: '1px solid', borderRadius: '999px', fontSize: '12px', fontWeight: 700, textTransform: 'capitalize', ...statusStyles[status] }}>
      {status}
    </span>
  );
}

function AssetRow({ asset }: { asset: StellarAssetVerification }) {
  return (
    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
      <td style={{ padding: '12px', verticalAlign: 'top' }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>{asset.assetCode}</div>
        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{asset.assetName}</div>
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top' }}>
        <StatusBadge status={asset.status} />
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top' }}>
        <div style={{ color: '#0f172a', fontFamily: asset.issuer ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'system-ui, sans-serif', fontSize: '12px', overflowWrap: 'anywhere' }}>
          {asset.issuer ?? 'Native asset'}
        </div>
        <div style={{ color: '#64748b', fontSize: '12px', marginTop: '6px' }}>
          Home domain: {asset.homeDomain ?? 'Not loaded'}
        </div>
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top', color: '#334155' }}>
        {tomlLabels[asset.tomlStatus]}
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top', color: '#334155' }}>
        {asset.decimals}
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top', color: '#334155' }}>
        {formatDateTime(asset.checkedAt)}
      </td>
      <td style={{ padding: '12px', verticalAlign: 'top', color: '#475569', minWidth: '240px' }}>
        {asset.reason}
      </td>
    </tr>
  );
}

export default function StellarAssetVerificationDashboard() {
  const [assets, setAssets] = useState<StellarAssetVerification[]>(INITIAL_VERIFICATION_RESULTS);
  const [filters, setFilters] = useState<FilterState>({ status: 'all', query: '' });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadJson(endpoint: string): Promise<unknown | null> {
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
      }

      return response.json();
    }

    async function loadAssets() {
      try {
        const verificationEndpoint = getVerificationEndpoint();

        if (verificationEndpoint) {
          const results = normalizeVerificationResponse(await loadJson(verificationEndpoint));
          if (results.length > 0) {
            setAssets(results);
            setLoadError(null);
            return;
          }
        }

        const discoveredAssets = normalizeDiscoveryResponse(await loadJson(getAssetDiscoveryEndpoint()));
        if (discoveredAssets.length > 0) {
          setAssets(discoveredAssets);
          setLoadError(null);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setLoadError('Live Stellar asset data is not available');
        }
      }
    }

    loadAssets();
    return () => controller.abort();
  }, []);

  const filteredAssets = useMemo(() => filterAssets(assets, filters), [assets, filters]);
  const summary = useMemo(() => summarizeAssets(assets), [assets]);

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '1180px', margin: '0 auto', color: '#0f172a' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px' }}>
        Stellar Asset Verification
      </h1>
      <p style={{ color: '#64748b', margin: '0 0 24px' }}>
        Central view of Stellar asset identity, issuer metadata, and verification outcomes.
      </p>

      {loadError && (
        <div style={{ padding: '12px 14px', border: '1px solid #fde68a', borderRadius: '8px', background: '#fefce8', color: '#854d0e', marginBottom: '16px', fontSize: '13px' }}>
          {loadError}. Showing locally known assets until verification results are published.
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <SummaryCard label="Assets" value={summary.total} />
        <SummaryCard label="Verified" value={summary.verified} />
        <SummaryCard label="Unverified" value={summary.unverified} />
        <SummaryCard label="Failed" value={summary.failed} />
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '16px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
        <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: 600, flex: '1 1 260px' }}>
          Search
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Asset, issuer, or home domain"
            style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
          />
        </label>
        <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
          Status
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FilterState['status'] }))}
            style={{ minWidth: '150px', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff', color: '#0f172a' }}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All' : status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Asset</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Status</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Issuer</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>TOML</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Decimals</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Checked</th>
              <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '12px', color: '#475569' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset) => (
              <AssetRow key={`${asset.assetCode}:${asset.issuer ?? 'native'}`} asset={asset} />
            ))}
          </tbody>
        </table>
        {filteredAssets.length === 0 && (
          <div style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>
            No Stellar assets match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
