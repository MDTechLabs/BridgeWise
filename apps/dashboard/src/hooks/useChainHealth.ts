'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ChainHealthState = 'healthy' | 'degraded' | 'down';
export type RelayerBalanceStatus = 'ok' | 'low' | 'critical';

export interface ChainHealth {
  chainId: string;
  chainName: string;
  status: ChainHealthState;
  /** RPC round-trip latency, in milliseconds. */
  blockLatencyMs: number;
  /** Highest block height this indexer has fully synced. */
  syncedHeight: number;
  /** Current tip of the chain, as reported by the RPC. */
  chainTipHeight: number;
  relayerBalanceNative: number;
  nativeTokenSymbol: string;
  relayerBalanceStatus: RelayerBalanceStatus;
  lastUpdated: number;
}

export type ChainHealthFetcher = () => Promise<ChainHealth[]>;

/** Below this balance (in native token units) a relayer wallet is flagged yellow. */
export const LOW_BALANCE_THRESHOLD = 0.5;
/** Below this balance (in native token units) a relayer wallet is flagged red. */
export const CRITICAL_BALANCE_THRESHOLD = 0.1;

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
/** A chain is considered degraded once it falls this many blocks behind the tip. */
const DEGRADED_BLOCK_LAG_THRESHOLD = 5;

export function relayerBalanceStatus(balanceNative: number): RelayerBalanceStatus {
  if (balanceNative < CRITICAL_BALANCE_THRESHOLD) return 'critical';
  if (balanceNative < LOW_BALANCE_THRESHOLD) return 'low';
  return 'ok';
}

const MOCK_CHAINS: Array<{ chainId: string; chainName: string; nativeTokenSymbol: string }> = [
  { chainId: 'stellar', chainName: 'Stellar', nativeTokenSymbol: 'XLM' },
  { chainId: 'ethereum', chainName: 'Ethereum', nativeTokenSymbol: 'ETH' },
  { chainId: 'arbitrum', chainName: 'Arbitrum', nativeTokenSymbol: 'ETH' },
  { chainId: 'polygon', chainName: 'Polygon', nativeTokenSymbol: 'MATIC' },
];

/**
 * Placeholder data source used until this hook is wired to a live operator
 * telemetry endpoint (e.g. the relayer fee/status API). Pass a real
 * `fetcher` via `useChainHealth`'s options to replace it.
 */
async function fetchMockChainHealth(): Promise<ChainHealth[]> {
  return MOCK_CHAINS.map((chain, i) => {
    const chainTipHeight = 1_000_000 + i * 137;
    const blocksBehind = Math.floor(Math.random() * 8);
    const syncedHeight = chainTipHeight - blocksBehind;
    const blockLatencyMs = 200 + Math.floor(Math.random() * 800);
    const relayerBalanceNative = Number((Math.random() * 1.2).toFixed(3));

    return {
      chainId: chain.chainId,
      chainName: chain.chainName,
      nativeTokenSymbol: chain.nativeTokenSymbol,
      chainTipHeight,
      syncedHeight,
      blockLatencyMs,
      relayerBalanceNative,
      relayerBalanceStatus: relayerBalanceStatus(relayerBalanceNative),
      status: blocksBehind > DEGRADED_BLOCK_LAG_THRESHOLD ? 'degraded' : 'healthy',
      lastUpdated: Date.now(),
    };
  });
}

export interface UseChainHealthOptions {
  /** Data source for chain health telemetry. Defaults to local mock data. */
  fetcher?: ChainHealthFetcher;
  /** Auto-refresh interval, in ms. Defaults to 15 seconds. */
  refreshIntervalMs?: number;
}

export interface UseChainHealthResult {
  chains: ChainHealth[];
  isLoading: boolean;
  error: Error | null;
  lastUpdated: number | null;
  refresh: () => void;
}

/**
 * Polls chain health telemetry (RPC latency, sync height, relayer wallet gas
 * balance) for every supported chain, auto-refreshing on an interval so an
 * operator dashboard always shows current state.
 */
export function useChainHealth(options: UseChainHealthOptions = {}): UseChainHealthResult {
  const { fetcher = fetchMockChainHealth, refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS } = options;

  const [chains, setChains] = useState<ChainHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Keep the latest fetcher available to the interval without re-triggering
  // the effect (and therefore resetting the interval) on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setChains(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load chain health'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [load, refreshIntervalMs]);

  return { chains, isLoading, error, lastUpdated, refresh: load };
}
