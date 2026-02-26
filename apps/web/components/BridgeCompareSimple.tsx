import React, { useState } from 'react';
import { useIsMounted } from './ui-lib/utils/ssr';

// Define all types locally
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

interface BridgeCompareProps {
  initialParams: BridgeQuoteParams;
  onQuoteSelect?: (quoteId: string) => void;
  refreshInterval?: number;
  autoRefresh?: boolean;
}

// Sort options
type SortOption = 'fee' | 'speed' | 'reliability' | 'recommended';

// Sort toggle component
const SortToggle: React.FC<{
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  disabled?: boolean;
}> = ({ currentSort, onSortChange, disabled = false }) => {
  const sortOptions = [
    { value: 'recommended' as SortOption, label: '⭐ Recommended', description: 'Best overall routes' },
    { value: 'fee' as SortOption, label: '💰 Lowest Fee', description: 'Cheapest routes first' },
    { value: 'speed' as SortOption, label: '⚡ Fastest', description: 'Quickest routes first' },
    { value: 'reliability' as SortOption, label: '🛡️ Most Reliable', description: 'Highest success rate' }
  ];

  return (
    <div className="flex items-center space-x-2 bg-gray-50 rounded-lg p-1">
      {sortOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onSortChange(option.value)}
          disabled={disabled}
          className={`
            flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium
            transition-all duration-200 ease-in-out
            ${currentSort === option.value
              ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={option.description}
        >
          <span className="text-lg">{option.label.split(' ')[0]}</span>
          <span className="hidden sm:inline">{option.label.split(' ').slice(1).join(' ')}</span>
        </button>
      ))}
    </div>
  );
};

// Quote card component
const QuoteCard: React.FC<{
  quote: Quote;
  isSelected: boolean;
  onSelect: () => void;
  isRefreshing?: boolean;
}> = ({ quote, isSelected, onSelect, isRefreshing = false }) => {
  return (
    <div 
      className={`bg-white rounded-lg border p-6 shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
        isSelected 
          ? 'border-blue-500 ring-2 ring-blue-200' 
          : 'border-gray-200 hover:border-gray-300'
      } ${isRefreshing ? 'opacity-75' : ''}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-600">
              {quote.provider?.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="font-semibold text-gray-900">
              {quote.provider || 'Unknown Provider'}
            </div>
            <div className="text-sm text-gray-500">
              {quote.estimatedTime || '~2 mins'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-gray-900">
            ${quote.outputAmount || '0.00'}
          </div>
          <div className="text-xs text-gray-500">
            {quote.outputToken || 'USDC'}
          </div>
        </div>
      </div>

      {/* Route Details */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">From:</span>
          <div className="flex items-center space-x-2">
            <span className="font-medium">{quote.sourceAmount || '100'}</span>
            <span className="text-gray-500">{quote.sourceToken || 'USDC'}</span>
            <span className="text-gray-400">on</span>
            <span className="font-medium">{quote.sourceChain || 'Ethereum'}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">To:</span>
          <div className="flex items-center space-x-2">
            <span className="font-medium">{quote.outputAmount || '99.50'}</span>
            <span className="text-gray-500">{quote.outputToken || 'USDC'}</span>
            <span className="text-gray-400">on</span>
            <span className="font-medium">{quote.destinationChain || 'Polygon'}</span>
          </div>
        </div>
      </div>

      {/* Fee Breakdown */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Bridge Fee</span>
          <span className="font-medium">
            ${quote.fees?.bridge || '0.50'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Gas Fee</span>
          <span className="font-medium">
            ${quote.fees?.gas || '2.00'}
          </span>
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <span>Total Cost</span>
          <span className="text-blue-600">
            ${(quote.fees?.bridge || 0.50) + (quote.fees?.gas || 2.00)}
          </span>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-4">
        <button 
          className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
            isSelected
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={onSelect}
        >
          {isSelected ? 'Selected' : 'Select Route'}
        </button>
      </div>
    </div>
  );
};

// Skeleton component
const QuoteSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            <div className="h-3 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
        <div className="h-6 bg-gray-200 rounded w-16"></div>
      </div>

      {/* Route details skeleton */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
          <div className="flex items-center space-x-2">
            <div className="h-4 bg-gray-200 rounded w-16"></div>
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="h-4 bg-gray-200 rounded w-12"></div>
          <div className="flex items-center space-x-2">
            <div className="h-4 bg-gray-200 rounded w-16"></div>
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
      </div>

      {/* Fee breakdown skeleton */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <div className="h-3 bg-gray-200 rounded w-16"></div>
          <div className="h-3 bg-gray-200 rounded w-20"></div>
        </div>
        <div className="flex justify-between text-sm">
          <div className="h-3 bg-gray-200 rounded w-14"></div>
          <div className="h-3 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <div className="h-4 bg-gray-200 rounded w-12"></div>
          <div className="h-4 bg-gray-200 rounded w-24"></div>
        </div>
      </div>

      {/* Action button skeleton */}
      <div className="mt-4">
        <div className="h-10 bg-gray-200 rounded-lg w-full"></div>
      </div>
    </div>
  );
};

// Main BridgeCompare component
export const BridgeCompareSimple: React.FC<BridgeCompareProps> = (props) => {
  const isMounted = useIsMounted();
  
  const {
    initialParams,
    onQuoteSelect,
    refreshInterval = 15000,
    autoRefresh = true
  } = props;

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock quotes data
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

  // Sort quotes
  const sortQuotes = (quotes: Quote[], sortBy: SortOption): Quote[] => {
    const sorted = [...quotes];
    
    switch (sortBy) {
      case 'fee':
        return sorted.sort((a, b) => {
          const feeA = (a.fees?.bridge || 0) + (a.fees?.gas || 0);
          const feeB = (b.fees?.bridge || 0) + (b.fees?.gas || 0);
          return feeA - feeB;
        });

      case 'speed':
        return sorted.sort((a, b) => {
          const speedA = a.speed || 2;
          const speedB = b.speed || 2;
          return speedA - speedB;
        });

      case 'reliability':
        return sorted.sort((a, b) => {
          const relA = a.reliability || 95;
          const relB = b.reliability || 95;
          return relB - relA;
        });

      case 'recommended':
      default:
        return sorted.sort((a, b) => {
          const feeA = (a.fees?.bridge || 0) + (a.fees?.gas || 0);
          const feeB = (b.fees?.bridge || 0) + (b.fees?.gas || 0);
          const speedA = a.speed || 2;
          const speedB = b.speed || 2;
          const relA = a.reliability || 95;
          const relB = b.reliability || 95;
          
          const scoreA = (feeA / 10) + speedA + (100 - relA) / 10;
          const scoreB = (feeB / 10) + speedB + (100 - relB) / 10;
          
          return scoreA - scoreB;
        });
    }
  };

  const sortedQuotes = sortQuotes(mockQuotes, sortBy);

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

  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  return (
    <div className="bridge-compare p-6">
      {/* Header with refresh controls and sorting */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Bridge Routes</h2>
          <SortToggle
            currentSort={sortBy}
            onSortChange={handleSortChange}
            disabled={isLoading}
          />
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Refresh quotes"
          >
            <svg
              className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C15.3019 3 18.1885 4.77814 19.7545 7.42909"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 7H21V3"
              />
            </svg>
            
            {isRefreshing && (
              <span className="ml-2 text-sm text-gray-600">Refreshing...</span>
            )}
          </button>
          
          <div className="text-sm text-gray-600">
            Updated: Just now
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <QuoteSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Refreshing skeleton */}
      {isRefreshing && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
          {sortedQuotes.map((quote) => (
            <QuoteSkeleton key={`refresh-${quote.id}`} />
          ))}
        </div>
      )}

      {/* Quotes grid */}
      {!isLoading && !isRefreshing && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedQuotes.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              isSelected={selectedQuoteId === quote.id}
              onSelect={() => handleQuoteSelect(quote.id)}
              isRefreshing={isRefreshing}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isRefreshing && sortedQuotes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No bridge routes found for selected parameters</p>
        </div>
      )}
    </div>
  );
};
