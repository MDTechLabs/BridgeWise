/**
 * Skeleton Loaders Demo Page
 * 
 * This page demonstrates the skeleton loaders for BridgeWise components
 * showing various loading states without layout shift.
 */

import React, { useState, useEffect } from 'react';
import { QuoteSkeleton, BridgeStatusSkeleton } from '../components/ui-lib/skeleton';
import { BridgeCompare } from '../components/BridgeCompare';
import { BridgeStatus } from '../components/BridgeStatus';

const SkeletonDemo = () => {
  const [loadingState, setLoadingState] = useState<'initial' | 'loading' | 'loaded' | 'refreshing'>('initial');
  const [showBridgeStatus, setShowBridgeStatus] = useState(false);

  // Simulate loading states
  useEffect(() => {
    if (loadingState === 'loading') {
      const timer = setTimeout(() => setLoadingState('loaded'), 3000);
      return () => clearTimeout(timer);
    }
  }, [loadingState]);

  const mockQuotes = [
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
      fees: { bridge: 0.50, gas: 2.00 }
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
      fees: { bridge: 0.80, gas: 2.50 }
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
      fees: { bridge: 1.20, gas: 3.00 }
    }
  ];

  const mockParams = {
    amount: '100',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    sourceToken: 'USDC',
    destinationToken: 'USDC',
    slippageTolerance: 1.0
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            BridgeWise Skeleton Loaders Demo
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Experience smooth loading states without layout shift
          </p>
          
          {/* Control Panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm inline-block">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Demo Controls</h3>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => setLoadingState('loading')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Show Loading State
              </button>
              <button
                onClick={() => setLoadingState('refreshing')}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Show Refreshing State
              </button>
              <button
                onClick={() => setLoadingState('loaded')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Show Loaded State
              </button>
              <button
                onClick={() => setShowBridgeStatus(!showBridgeStatus)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                {showBridgeStatus ? 'Hide' : 'Show'} Bridge Status
              </button>
            </div>
          </div>
        </div>

        {/* Bridge Compare Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Bridge Compare Component</h2>
          
          {loadingState === 'initial' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <p className="text-blue-800">Click "Show Loading State" to see skeleton loaders in action</p>
            </div>
          )}

          {loadingState === 'loading' && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">🔄 Loading State: Showing initial skeleton loaders</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <QuoteSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {loadingState === 'refreshing' && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">🔄 Refreshing State: Showing skeleton overlay</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockQuotes.map((quote) => (
                  <div key={quote.id} className="relative">
                    <div className="absolute inset-0 z-10 bg-white bg-opacity-80">
                      <QuoteSkeleton />
                    </div>
                    <div className="opacity-30">
                      {/* This would be the actual QuoteCard content */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingState === 'loaded' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">✅ Loaded State: Real content displayed</p>
              </div>
              <BridgeCompare 
                initialParams={mockParams}
                onQuoteSelect={(quoteId) => console.log('Selected:', quoteId)}
              />
            </div>
          )}
        </div>

        {/* Bridge Status Section */}
        {showBridgeStatus && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Bridge Status Component</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Skeleton State */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Skeleton State</h3>
                <BridgeStatusSkeleton />
              </div>
              
              {/* Real Component */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Real Component</h3>
                <BridgeStatus />
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Skeleton Loader Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">No Layout Shift</h3>
              <p className="text-gray-600 text-sm">Skeletons maintain exact dimensions of content</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smooth Animations</h3>
              <p className="text-gray-600 text-sm">Pulse animations provide visual feedback</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Responsive Design</h3>
              <p className="text-gray-600 text-sm">Adapts to different screen sizes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonDemo;
