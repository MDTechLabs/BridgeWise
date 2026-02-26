import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RankingMode = 'balanced' | 'lowest-cost' | 'fastest';

export type BridgeStatus = 'active' | 'degraded' | 'offline';

export interface NormalizedQuote {
  bridgeId: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  inputAmount: number;
  outputAmount: number;
  totalFeeUsd: number;
  estimatedTimeSeconds: number;
  slippagePercent: number;
  reliabilityScore: number;
  compositeScore: number;
  rankingPosition: number;
  bridgeStatus: BridgeStatus;
  metadata: Record<string, unknown>;
  fetchedAt: string;
}

export interface QuoteResponse {
  quotes: NormalizedQuote[];
  bestRoute: NormalizedQuote;
  rankingMode: RankingMode;
  successfulProviders: number;
  totalProviders: number;
  fetchDurationMs: number;
}

export interface BridgeCompareProps {
  /** Source blockchain identifier */
  sourceChain: string;
  /** Destination blockchain identifier */
  destinationChain: string;
  /** Token to bridge */
  sourceToken: string;
  /** Amount to bridge (in token units) */
  amount: number;
  /** Route ranking strategy */
  rankingMode?: RankingMode;
  /** API base URL for the BridgeWise backend */
  apiBaseUrl?: string;
  /** Custom theme overrides */
  theme?: BridgeCompareTheme;
  /** Called when the user selects a route */
  onRouteSelect?: (route: NormalizedQuote) => void;
  /** Called when quotes are successfully loaded */
  onQuotesLoaded?: (response: QuoteResponse) => void;
  /** Called on fetch error */
  onError?: (error: Error) => void;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom error component */
  errorComponent?: (error: Error, retry: () => void) => React.ReactNode;
}

export interface BridgeCompareTheme {
  primaryColor?: string;
  backgroundColor?: string;
  cardBackground?: string;
  textColor?: string;
  borderColor?: string;
  selectedBorderColor?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_THEME: Required<BridgeCompareTheme> = {
  primaryColor: '#6366f1',
  backgroundColor: '#f8fafc',
  cardBackground: '#ffffff',
  textColor: '#1e293b',
  borderColor: '#e2e8f0',
  selectedBorderColor: '#6366f1',
};

const RANKING_LABELS: Record<RankingMode, string> = {
  balanced: 'Balanced',
  'lowest-cost': 'Lowest Cost',
  fastest: 'Fastest',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatFee(fee: number): string {
  return `$${fee.toFixed(2)}`;
}

function formatSlippage(pct: number): string {
  return `${pct.toFixed(3)}%`;
}

function reliabilityBadge(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 75) return { label: 'Good', color: '#84cc16' };
  if (score >= 60) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'Poor', color: '#ef4444' };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface QuoteCardProps {
  quote: NormalizedQuote;
  isSelected: boolean;
  isBest: boolean;
  theme: Required<BridgeCompareTheme>;
  onSelect: (quote: NormalizedQuote) => void;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote, isSelected, isBest, theme, onSelect }) => {
  const badge = reliabilityBadge(quote.reliabilityScore);
  const isOffline = quote.bridgeStatus === 'offline';

  const cardStyle: React.CSSProperties = {
    background: theme.cardBackground,
    border: `2px solid ${isSelected ? theme.selectedBorderColor : theme.borderColor}`,
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 12,
    cursor: isOffline ? 'not-allowed' : 'pointer',
    opacity: isOffline ? 0.5 : 1,
    position: 'relative',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxShadow: isSelected ? `0 0 0 3px ${theme.primaryColor}22` : 'none',
  };

  return (
    <div
      style={cardStyle}
      role="button"
      aria-pressed={isSelected}
      aria-disabled={isOffline}
      tabIndex={isOffline ? -1 : 0}
      data-testid={`quote-card-${quote.bridgeId}`}
      onClick={() => !isOffline && onSelect(quote)}
      onKeyDown={(e) => e.key === 'Enter' && !isOffline && onSelect(quote)}
    >
      {/* Best badge */}
      {isBest && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            right: 12,
            background: theme.primaryColor,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 10px',
            borderRadius: 20,
          }}
        >
          ★ Best Route
        </span>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: theme.textColor }}>
            #{quote.rankingPosition} {quote.bridgeName}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              background: badge.color + '22',
              color: badge.color,
            }}
            data-testid={`reliability-badge-${quote.bridgeId}`}
          >
            {badge.label}
          </span>
        </div>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          Score: <strong style={{ color: theme.textColor }}>{quote.compositeScore.toFixed(1)}</strong>
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Metric label="Total Fee" value={formatFee(quote.totalFeeUsd)} theme={theme} />
        <Metric label="Speed" value={formatTime(quote.estimatedTimeSeconds)} theme={theme} />
        <Metric label="Slippage" value={formatSlippage(quote.slippagePercent)} theme={theme} />
        <Metric label="Reliability" value={`${quote.reliabilityScore.toFixed(0)}%`} theme={theme} />
      </div>

      {/* Output amount + CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          You receive:{' '}
          <strong style={{ color: theme.textColor }}>
            {quote.outputAmount.toFixed(4)} {quote.destinationToken}
          </strong>
        </span>
        <button
          style={{
            background: isSelected ? theme.primaryColor : 'transparent',
            color: isSelected ? '#fff' : theme.primaryColor,
            border: `1.5px solid ${theme.primaryColor}`,
            borderRadius: 8,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          aria-label={`Select ${quote.bridgeName} route`}
          onClick={(e) => { e.stopPropagation(); !isOffline && onSelect(quote); }}
        >
          {isSelected ? '✓ Selected' : 'Select Route'}
        </button>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; theme: Required<BridgeCompareTheme> }> = ({
  label, value, theme,
}) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: theme.textColor }}>{value}</div>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * BridgeCompare — Embeddable multi-chain bridge aggregator component.
 *
 * @example
 * <BridgeCompare
 *   sourceChain="stellar"
 *   destinationChain="ethereum"
 *   sourceToken="USDC"
 *   amount={100}
 *   rankingMode="balanced"
 *   onRouteSelect={(route) => console.log(route)}
 * />
 */
export const BridgeCompare: React.FC<BridgeCompareProps> = ({
  sourceChain,
  destinationChain,
  sourceToken,
  amount,
  rankingMode = 'balanced',
  apiBaseUrl = 'http://localhost:3000',
  theme: userTheme,
  onRouteSelect,
  onQuotesLoaded,
  onError,
  loadingComponent,
  errorComponent,
}) => {
  const theme: Required<BridgeCompareTheme> = { ...DEFAULT_THEME, ...userTheme };

  const [quoteResponse, setQuoteResponse]   = useState<QuoteResponse | null>(null);
  const [selectedRoute, setSelectedRoute]   = useState<NormalizedQuote | null>(null);
  const [activeMode, setActiveMode]         = useState<RankingMode>(rankingMode);
  const [isLoading, setIsLoading]           = useState(false);
  const [error, setError]                   = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchQuotes = useCallback(async (mode: RankingMode) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setSelectedRoute(null);

    try {
      const params = new URLSearchParams({
        sourceChain,
        destinationChain,
        sourceToken,
        amount: String(amount),
        rankingMode: mode,
      });

      const res = await fetch(`${apiBaseUrl}/bridge-compare/quotes?${params}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed: ${res.status}`);
      }

      const data: QuoteResponse = await res.json();
      setQuoteResponse(data);
      onQuotesLoaded?.(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    } finally {
      setIsLoading(false);
    }
  }, [sourceChain, destinationChain, sourceToken, amount, apiBaseUrl, onQuotesLoaded, onError]);

  // Re-fetch when key props change
  useEffect(() => {
    fetchQuotes(activeMode);
    return () => abortRef.current?.abort();
  }, [fetchQuotes, activeMode]);

  // Sync external rankingMode prop changes
  useEffect(() => {
    setActiveMode(rankingMode);
  }, [rankingMode]);

  const handleRouteSelect = (route: NormalizedQuote) => {
    setSelectedRoute(route);
    onRouteSelect?.(route);
  };

  const handleRetry = () => fetchQuotes(activeMode);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ background: theme.backgroundColor, fontFamily: 'system-ui, sans-serif', padding: 24, borderRadius: 16, minWidth: 360 }}
      data-testid="bridge-compare-root"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: theme.textColor }}>
            Bridge Compare
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
            {amount} {sourceToken} · {sourceChain} → {destinationChain}
          </p>
        </div>

        {/* Ranking mode tabs */}
        <div style={{ display: 'flex', gap: 4, background: theme.borderColor, borderRadius: 10, padding: 4 }}>
          {(Object.keys(RANKING_LABELS) as RankingMode[]).map((mode) => (
            <button
              key={mode}
              data-testid={`ranking-tab-${mode}`}
              onClick={() => setActiveMode(mode)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                background: activeMode === mode ? theme.primaryColor : 'transparent',
                color: activeMode === mode ? '#fff' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              {RANKING_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div data-testid="loading-state">
          {loadingComponent ?? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <p style={{ margin: 0, fontSize: 14 }}>Fetching bridge quotes…</p>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div data-testid="error-state">
          {errorComponent ? errorComponent(error, handleRetry) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#ef4444' }}>{error.message}</p>
              <button
                onClick={handleRetry}
                data-testid="retry-button"
                style={{
                  background: theme.primaryColor, color: '#fff',
                  border: 'none', borderRadius: 8, padding: '8px 20px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quotes list */}
      {!isLoading && !error && quoteResponse && (
        <div data-testid="quotes-list">
          {/* Summary row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>
            <span>{quoteResponse.successfulProviders}/{quoteResponse.totalProviders} providers responded</span>
            <span>{quoteResponse.fetchDurationMs}ms</span>
          </div>

          {/* Sort indicator */}
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            Sorted by:{' '}
            <strong style={{ color: theme.primaryColor }}>{RANKING_LABELS[quoteResponse.rankingMode]}</strong>
          </div>

          {quoteResponse.quotes.map((quote) => (
            <QuoteCard
              key={quote.bridgeId}
              quote={quote}
              isSelected={selectedRoute?.bridgeId === quote.bridgeId}
              isBest={quote.bridgeId === quoteResponse.bestRoute.bridgeId}
              theme={theme}
              onSelect={handleRouteSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BridgeCompare;
