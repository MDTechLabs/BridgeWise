// packages/ui/src/components/BridgeCompare.tsx

import React, { useState, useEffect } from 'react';
import { useIsMounted } from './ui-lib/utils/ssr';
import { RefreshIndicator } from './RefreshIndicator';
import { QuoteCard } from './QuoteCard';
import { SlippageWarning } from './SlippageWarning';
import { QuoteSkeleton } from './ui-lib/skeleton';
import { SortToggle, SortOption, sortQuotes, enhanceQuotesForSorting } from './ui-lib/sorting';

// Define types locally since external packages may not be available
interface BridgeQuoteParams {
  amount: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  userAddress?: string;
  slippageTolerance?: number;
}

interface Quote {
  id: string;
  provider?: string;
  estimatedTime?: string;
  outputAmount?: string;
  outputToken?: string;
  sourceAmount?: string;
  sourceToken?: string;
  sourceChain?: string;
  destinationChain?: string;
  fees?: {
    bridge?: number;
    gas?: number;
  };
  reliability?: number;
  speed?: number;
}

// Mock hook since @bridgewise/react may not be available
const useBridgeQuotes = (options: any) => {
  // Mock implementation for demo purposes
  const mockQuotes: Quote[] = [
    {
      id: '1',
      provider: 'LayerZero',
      estimatedTime: '~2 mins',
      outputAmount: '99.50',
      outputToken: 'USDC',
      sourceAmount: '100',
      sourceToken: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Polygon',
      fees: { bridge: 0.50, gas: 2.00 },
      reliability: 95,
      speed: 2
    },
    {
      id: '2',
      provider: 'Hop Protocol',
      estimatedTime: '~3 mins',
      outputAmount: '99.20',
      outputToken: 'USDC',
      sourceAmount: '100',
      sourceToken: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Polygon',
      fees: { bridge: 0.80, gas: 2.50 },
      reliability: 92,
      speed: 3
    },
    {
      id: '3',
      provider: 'Multichain',
      estimatedTime: '~5 mins',
      outputAmount: '98.80',
      outputToken: 'USDC',
      sourceAmount: '100',
      sourceToken: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Polygon',
      fees: { bridge: 1.20, gas: 3.00 },
      reliability: 88,
      speed: 5
    }
  ];

  return {
    quotes: mockQuotes,
    isLoading: false,
    error: null,
    lastRefreshed: new Date(),
    isRefreshing: false,
    refresh: () => console.log('Refresh called'),
    updateParams: () => console.log('Update params called'),
    retryCount: 0,
    ...options
  };
};

interface BridgeCompareProps {
  initialParams: BridgeQuoteParams;
  onQuoteSelect?: (quoteId: string) => void;
  refreshInterval?: number;
  autoRefresh?: boolean;
}

export const BridgeCompare: React.FC<BridgeCompareProps> = (props) => {
  const isMounted = useIsMounted();
  
  const {
    initialParams,
    onQuoteSelect,
    refreshInterval = 15000,
    autoRefresh = true
  } = props;

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showRefreshIndicator, setShowRefreshIndicator] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('recommended');

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
    onRefreshStart: () => isMounted && setShowRefreshIndicator(true),
    onRefreshEnd: () => {
      if (isMounted) {
        setTimeout(() => setShowRefreshIndicator(false), 1000);
      }
    }
  });

  // Handle quote selection
  const handleQuoteSelect = (quoteId: string) => {
    if (isMounted) {
      setSelectedQuoteId(quoteId);
      onQuoteSelect?.(quoteId);
    }
  };

  // Handle sort change
  const handleSortChange = (newSortBy: SortOption) => {
    setSortBy(newSortBy);
  };

  // Apply sorting to quotes
  const sortedQuotes = quotes.length > 0 ? sortQuotes(enhanceQuotesForSorting(quotes), sortBy) : quotes;

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
      {/* Header with refresh controls and sorting */}
      <div className="bridge-compare__header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2>Bridge Routes</h2>
          <SortToggle
            currentSort={sortBy}
            onSortChange={handleSortChange}
            disabled={isLoading}
          />
        </div>
        
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

      {/* Loading skeleton - Enhanced with proper skeleton components */}
      {isLoading && quotes.length === 0 && (
        <div className="bridge-compare__skeleton grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <QuoteSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Refreshing skeleton - Show when refreshing existing quotes */}
      {isRefreshing && quotes.length > 0 && (
        <div className="bridge-compare__refreshing-skeleton grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
          {quotes.map((quote) => (
            <QuoteSkeleton key={`refresh-${quote.id}`} />
          ))}
        </div>
      )}

      {/* Quotes grid */}
      {sortedQuotes.length > 0 && (
        <div className="bridge-compare__quotes-grid">
          {sortedQuotes.map((quote: any) => (
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

      {/* Empty state */}
      {!isLoading && quotes.length === 0 && !error && (
        <div className="bridge-compare__empty">
          <p>No bridge routes found for the selected parameters</p>
        </div>
      )}
    </div>
  );
};