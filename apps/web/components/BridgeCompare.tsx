// packages/ui/src/components/BridgeCompare.tsx

import React, { useState, useEffect } from 'react';
import { useBridgeQuotes, BridgeQuoteParams } from '@bridgewise/react';
import { RefreshIndicator } from './RefreshIndicator';
import { QuoteCard } from './QuoteCard';
import { SlippageWarning } from './SlippageWarning';

interface BridgeCompareProps {
  initialParams: BridgeQuoteParams;
  onQuoteSelect?: (quoteId: string) => void;
  refreshInterval?: number;
  autoRefresh?: boolean;
}

export const BridgeCompare: React.FC<BridgeCompareProps> = ({
  initialParams,
  onQuoteSelect,
  refreshInterval = 15000,
  autoRefresh = true
}) => {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showRefreshIndicator, setShowRefreshIndicator] = useState(false);

  const {
    quotes,
    isLoading,
    error,
    lastRefreshed,
    isRefreshing,
    refresh,
    updateParams,
    retryCount
  } = useBridgeQuotes({
    initialParams,
    intervalMs: refreshInterval,
    autoRefresh,
    onRefreshStart: () => setShowRefreshIndicator(true),
    onRefreshEnd: () => {
      setTimeout(() => setShowRefreshIndicator(false), 1000);
    }
  });

  // Handle quote selection
  const handleQuoteSelect = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    onQuoteSelect?.(quoteId);
  };

  // Format last refreshed time
  const getLastRefreshedText = () => {
    if (!lastRefreshed) return 'Never';
    
    const seconds = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return lastRefreshed.toLocaleTimeString();
  };

  return (
    <div className="bridge-compare">
      {/* Header with refresh controls */}
      <div className="bridge-compare__header">
        <h2>Bridge Routes</h2>
        
        <div className="bridge-compare__refresh-controls">
          <RefreshIndicator 
            isRefreshing={isRefreshing}
            lastRefreshed={lastRefreshed}
            onClick={refresh}
            showAnimation={showRefreshIndicator}
          />
          
          <div className="bridge-compare__refresh-info">
            <span className="bridge-compare__refresh-time">
              Updated: {getLastRefreshedText()}
            </span>
            {retryCount > 0 && (
              <span className="bridge-compare__retry-count">
                Retry {retryCount}/{3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bridge-compare__error" role="alert">
          <p>Failed to fetch quotes: {error.message}</p>
          <button onClick={refresh} disabled={isRefreshing}>
            Try Again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && quotes.length === 0 && (
        <div className="bridge-compare__skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="quote-skeleton" />
          ))}
        </div>
      )}

      {/* Quotes grid */}
      {quotes.length > 0 && (
        <div className="bridge-compare__quotes-grid">
          {quotes.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              isSelected={selectedQuoteId === quote.id}
              onSelect={() => handleQuoteSelect(quote.id)}
              isRefreshing={isRefreshing && showRefreshIndicator}
            />
          ))}
        </div>
      )}

      {/* Slippage warning for outdated quotes */}
      {lastRefreshed && (
        <SlippageWarning
          lastRefreshed={lastRefreshed}
          quotes={quotes}
          refreshThreshold={30000} // 30 seconds
          onRefresh={refresh}
        />
      )}

      {/* Empty state */}
      {!isLoading && quotes.length === 0 && !error && (
        <div className="bridge-compare__empty">
          <p>No bridge routes found for the selected parameters</p>
        </div>
      )}
    </div>
  );
};