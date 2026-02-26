import React from 'react';

// Define quote interface since the import is not available
interface QuoteFees {
  bridge?: number;
  gas?: number;
}

interface NormalizedQuote {
  id: string;
  provider?: string;
  estimatedTime?: string;
  outputAmount?: string;
  outputToken?: string;
  sourceAmount?: string;
  sourceToken?: string;
  sourceChain?: string;
  destinationChain?: string;
  fees?: QuoteFees;
}

interface QuoteCardProps {
  quote: NormalizedQuote;
  isSelected: boolean;
  onSelect: () => void;
  isRefreshing?: boolean;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  isSelected,
  onSelect,
  isRefreshing = false
}) => {
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
              {quote.sourceChain?.slice(0, 2).toUpperCase()}
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
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {isSelected ? 'Selected' : 'Select Route'}
        </button>
      </div>
    </div>
  );
};
