"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeCompare = void 0;
const react_1 = __importStar(require("react"));
// ─── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_THEME = {
    primaryColor: '#6366f1',
    backgroundColor: '#f8fafc',
    cardBackground: '#ffffff',
    textColor: '#1e293b',
    borderColor: '#e2e8f0',
    selectedBorderColor: '#6366f1',
};
const RANKING_LABELS = {
    balanced: 'Balanced',
    'lowest-cost': 'Lowest Cost',
    fastest: 'Fastest',
};
// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
function formatFee(fee) {
    return `$${fee.toFixed(2)}`;
}
function formatSlippage(pct) {
    return `${pct.toFixed(3)}%`;
}
function reliabilityBadge(score) {
    if (score >= 90)
        return { label: 'Excellent', color: '#22c55e' };
    if (score >= 75)
        return { label: 'Good', color: '#84cc16' };
    if (score >= 60)
        return { label: 'Fair', color: '#f59e0b' };
    return { label: 'Poor', color: '#ef4444' };
}
const QuoteCard = ({ quote, isSelected, isBest, theme, onSelect }) => {
    const badge = reliabilityBadge(quote.reliabilityScore);
    const isOffline = quote.bridgeStatus === 'offline';
    const cardStyle = {
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
    return (<div style={cardStyle} role="button" aria-pressed={isSelected} aria-disabled={isOffline} tabIndex={isOffline ? -1 : 0} data-testid={`quote-card-${quote.bridgeId}`} onClick={() => !isOffline && onSelect(quote)} onKeyDown={(e) => e.key === 'Enter' && !isOffline && onSelect(quote)}>
      {/* Best badge */}
      {isBest && (<span style={{
                position: 'absolute',
                top: -10,
                right: 12,
                background: theme.primaryColor,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: 20,
            }}>
          ★ Best Route
        </span>)}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: theme.textColor }}>
            #{quote.rankingPosition} {quote.bridgeName}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 12,
            background: badge.color + '22',
            color: badge.color,
        }} data-testid={`reliability-badge-${quote.bridgeId}`}>
            {badge.label}
          </span>
        </div>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          Score: <strong style={{ color: theme.textColor }}>{quote.compositeScore.toFixed(1)}</strong>
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Metric label="Total Fee" value={formatFee(quote.totalFeeUsd)} theme={theme}/>
        <Metric label="Speed" value={formatTime(quote.estimatedTimeSeconds)} theme={theme}/>
        <Metric label="Slippage" value={formatSlippage(quote.slippagePercent)} theme={theme}/>
        <Metric label="Reliability" value={`${quote.reliabilityScore.toFixed(0)}%`} theme={theme}/>
      </div>

      {/* Output amount + CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          You receive:{' '}
          <strong style={{ color: theme.textColor }}>
            {quote.outputAmount.toFixed(4)} {quote.destinationToken}
          </strong>
        </span>
        <button style={{
            background: isSelected ? theme.primaryColor : 'transparent',
            color: isSelected ? '#fff' : theme.primaryColor,
            border: `1.5px solid ${theme.primaryColor}`,
            borderRadius: 8,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
        }} aria-label={`Select ${quote.bridgeName} route`} onClick={(e) => { e.stopPropagation(); !isOffline && onSelect(quote); }}>
          {isSelected ? '✓ Selected' : 'Select Route'}
        </button>
      </div>
    </div>);
};
const Metric = ({ label, value, theme, }) => (<div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: theme.textColor }}>{value}</div>
  </div>);
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
const BridgeCompare = ({ sourceChain, destinationChain, sourceToken, amount, rankingMode = 'balanced', apiBaseUrl = 'http://localhost:3000', theme: userTheme, onRouteSelect, onQuotesLoaded, onError, loadingComponent, errorComponent, }) => {
    const theme = { ...DEFAULT_THEME, ...userTheme };
    const [quoteResponse, setQuoteResponse] = (0, react_1.useState)(null);
    const [selectedRoute, setSelectedRoute] = (0, react_1.useState)(null);
    const [activeMode, setActiveMode] = (0, react_1.useState)(rankingMode);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const abortRef = (0, react_1.useRef)(null);
    const fetchQuotes = (0, react_1.useCallback)(async (mode) => {
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
            const data = await res.json();
            setQuoteResponse(data);
            onQuotesLoaded?.(data);
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError')
                return;
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            onError?.(e);
        }
        finally {
            setIsLoading(false);
        }
    }, [sourceChain, destinationChain, sourceToken, amount, apiBaseUrl, onQuotesLoaded, onError]);
    // Re-fetch when key props change
    (0, react_1.useEffect)(() => {
        fetchQuotes(activeMode);
        return () => abortRef.current?.abort();
    }, [fetchQuotes, activeMode]);
    // Sync external rankingMode prop changes
    (0, react_1.useEffect)(() => {
        setActiveMode(rankingMode);
    }, [rankingMode]);
    const handleRouteSelect = (route) => {
        setSelectedRoute(route);
        onRouteSelect?.(route);
    };
    const handleRetry = () => fetchQuotes(activeMode);
    // ─── Render ────────────────────────────────────────────────────────────────
    return (<div style={{ background: theme.backgroundColor, fontFamily: 'system-ui, sans-serif', padding: 24, borderRadius: 16, minWidth: 360 }} data-testid="bridge-compare-root">
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
          {Object.keys(RANKING_LABELS).map((mode) => (<button key={mode} data-testid={`ranking-tab-${mode}`} onClick={() => setActiveMode(mode)} style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                background: activeMode === mode ? theme.primaryColor : 'transparent',
                color: activeMode === mode ? '#fff' : '#64748b',
                transition: 'all 0.15s ease',
            }}>
              {RANKING_LABELS[mode]}
            </button>))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (<div data-testid="loading-state">
          {loadingComponent ?? (<div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <p style={{ margin: 0, fontSize: 14 }}>Fetching bridge quotes…</p>
            </div>)}
        </div>)}

      {/* Error state */}
      {!isLoading && error && (<div data-testid="error-state">
          {errorComponent ? errorComponent(error, handleRetry) : (<div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#ef4444' }}>{error.message}</p>
              <button onClick={handleRetry} data-testid="retry-button" style={{
                    background: theme.primaryColor, color: '#fff',
                    border: 'none', borderRadius: 8, padding: '8px 20px',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                Retry
              </button>
            </div>)}
        </div>)}

      {/* Quotes list */}
      {!isLoading && !error && quoteResponse && (<div data-testid="quotes-list">
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

          {quoteResponse.quotes.map((quote) => (<QuoteCard key={quote.bridgeId} quote={quote} isSelected={selectedRoute?.bridgeId === quote.bridgeId} isBest={quote.bridgeId === quoteResponse.bestRoute.bridgeId} theme={theme} onSelect={handleRouteSelect}/>))}
        </div>)}
    </div>);
};
exports.BridgeCompare = BridgeCompare;
exports.default = exports.BridgeCompare;
//# sourceMappingURL=BridgeCompare.js.map