/**
 * Bridge Route Sorting Demo
 * 
 * This page demonstrates the sorting functionality for bridge routes
 * showing fee, speed, reliability, and recommended sorting options.
 */

import React, { useState } from 'react';
import { BridgeCompare } from '../components/BridgeCompare';
import { SortOption } from '../components/ui-lib/sorting';

const SortingDemo = () => {
  const [currentSort, setCurrentSort] = useState<SortOption>('recommended');

  const mockParams = {
    amount: '100',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    sourceToken: 'USDC',
    destinationToken: 'USDC',
    slippageTolerance: 1.0
  };

  const handleSortChange = (sortBy: SortOption) => {
    setCurrentSort(sortBy);
    console.log('Sort changed to:', sortBy);
  };

  const sortDescriptions = {
    recommended: {
      title: '⭐ Recommended',
      description: 'Best overall routes based on fee, speed, and reliability',
      details: 'Balanced approach considering all factors'
    },
    fee: {
      title: '💰 Lowest Fee',
      description: 'Routes with the lowest total fees',
      details: 'Prioritizes cost savings over speed'
    },
    speed: {
      title: '⚡ Fastest',
      description: 'Quickest completion times',
      details: 'Prioritizes speed over cost'
    },
    reliability: {
      title: '🛡️ Most Reliable',
      description: 'Routes with highest success rates',
      details: 'Prioritizes success rate over speed and cost'
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Bridge Route Sorting Demo
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Experience intelligent route sorting for optimal bridge selection
          </p>
          
          {/* Current Sort Display */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm inline-block mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Current Sort: {sortDescriptions[currentSort as SortOption].title}
            </h3>
            <p className="text-gray-600 text-sm mb-2">
              {sortDescriptions[currentSort as SortOption].description}
            </p>
            <p className="text-gray-500 text-xs">
              {sortDescriptions[currentSort as SortOption].details}
            </p>
          </div>
        </div>

        {/* Bridge Compare with Sorting */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Interactive Bridge Comparison
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-800">
              💡 <strong>Try the sorting options above!</strong> The bridge routes will be reordered 
              instantly based on your selection. Default is "Recommended" which provides the best balance.
            </p>
          </div>
          
          <BridgeCompare 
            initialParams={mockParams}
            onQuoteSelect={(quoteId) => {
              console.log('Selected quote:', quoteId);
              alert(`Selected quote: ${quoteId}`);
            }}
            refreshInterval={10000}
            autoRefresh={false}
          />
        </div>

        {/* Sorting Options Explanation */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Sorting Options Explained
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(sortDescriptions).map(([key, info]) => (
              <div 
                key={key}
                className={`
                  p-6 rounded-lg border-2 transition-all duration-200
                  ${currentSort === key 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }
                `}
              >
                <div className="flex items-center mb-3">
                  <span className="text-2xl mr-3">{info.title}</span>
                  {currentSort === key && (
                    <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                
                <h3 className="font-semibold text-gray-900 mb-2">
                  {info.title}
                </h3>
                <p className="text-gray-700 text-sm mb-2">
                  {info.description}
                </p>
                <p className="text-gray-500 text-xs">
                  {info.details}
                </p>
                
                <button
                  onClick={() => handleSortChange(key as SortOption)}
                  className={`
                    mt-4 w-full py-2 px-4 rounded-lg font-medium transition-colors
                    ${currentSort === key
                      ? 'bg-blue-600 text-white cursor-default'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                  disabled={currentSort === key}
                >
                  {currentSort === key ? 'Currently Selected' : 'Select This Sort'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            🎯 Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span className="text-2xl">🔄</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Instant Sorting</h3>
              <p className="text-gray-600 text-sm">Routes reorder immediately when sort changes</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smart Algorithm</h3>
              <p className="text-gray-600 text-sm">Intelligent scoring for recommended routes</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Fee Analysis</h3>
              <p className="text-gray-600 text-sm">Comprehensive fee breakdown and comparison</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span className="text-2xl">🛡️</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Reliability Score</h3>
              <p className="text-gray-600 text-sm">Success rate and performance metrics</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SortingDemo;
