import React, { useState, useEffect } from 'react';
import { useTransactionPersistence } from './ui-lib/hooks/useTransactionPersistence';
import { useIsMounted } from './ui-lib/utils/ssr';
import { BridgeStatusSkeleton } from './ui-lib/skeleton/BridgeStatusSkeleton';

interface BridgeStatusProps {
  className?: string;
}

export const BridgeStatus: React.FC<BridgeStatusProps> = ({ className = '' }) => {
  const isMounted = useIsMounted();
  const { state, clearState, updateState } = useTransactionPersistence();
  const [showDetails, setShowDetails] = useState(false);

  // Simulate bridge progress for demo purposes
  useEffect(() => {
    if (state.status === 'pending' && isMounted) {
      const progressInterval = setInterval(() => {
        updateState({
          progress: Math.min(state.progress + 10, 90),
          step: getProgressStep(state.progress)
        });
      }, 1000);

      // Complete the transaction after reaching 90%
      if (state.progress >= 90) {
        clearInterval(progressInterval);
        setTimeout(() => {
          updateState({
            status: 'success',
            progress: 100,
            step: 'Transaction Complete',
            txHash: '0x' + Math.random().toString(16).slice(2, 66)
          });
        }, 1000);
      }

      return () => clearInterval(progressInterval);
    }
  }, [state.status, state.progress, updateState, isMounted]);

  const getProgressStep = (progress: number): string => {
    if (progress < 20) return 'Initializing bridge...';
    if (progress < 40) return 'Approving token...';
    if (progress < 60) return 'Bridging assets...';
    if (progress < 80) return 'Confirming transaction...';
    if (progress < 100) return 'Finalizing bridge...';
    return 'Transaction Complete';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-blue-600';
      case 'success': return 'text-green-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-100';
      case 'success': return 'bg-green-100';
      case 'failed': return 'bg-red-100';
      default: return 'bg-gray-100';
    }
  };

  if (!isMounted || state.status === 'idle') {
    return <BridgeStatusSkeleton className={className} />;
  }

  if (state.status === 'idle') {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 shadow-sm ${className}`}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Bridge</h3>
          <p className="text-gray-600">Select a route to start bridging your assets</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Bridge Status</h3>
          <p className={`text-sm ${getStatusColor(state.status)}`}>
            {state.status.charAt(0).toUpperCase() + state.status.slice(1)}
          </p>
        </div>
        {state.status !== 'idle' && (
          <button
            onClick={clearState}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear status"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {state.status === 'pending' && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-medium text-gray-700">{state.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${state.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Current Step */}
      <div className={`p-4 rounded-lg mb-6 ${getStatusBgColor(state.status)}`}>
        <div className="flex items-center space-x-3">
          {state.status === 'pending' && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          )}
          {state.status === 'success' && (
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {state.status === 'failed' && (
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <div>
            <p className={`font-medium ${getStatusColor(state.status)}`}>
              {state.step}
            </p>
            <p className="text-sm text-gray-600">
              {state.status === 'pending' && 'Please keep this window open'}
              {state.status === 'success' && 'Your assets have been bridged successfully'}
              {state.status === 'failed' && 'Transaction failed. Please try again'}
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Details */}
      {(state.status === 'success' || state.status === 'failed') && (
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center justify-between w-full text-left mb-4 hover:text-gray-700 transition-colors"
          >
            <span className="font-medium text-gray-900">Transaction Details</span>
            <svg 
              className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDetails && (
            <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Transaction ID</span>
                <span className="font-mono text-gray-900">{state.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status</span>
                <span className={`font-medium ${getStatusColor(state.status)}`}>
                  {state.status.charAt(0).toUpperCase() + state.status.slice(1)}
                </span>
              </div>
              {state.txHash && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Transaction Hash</span>
                  <a 
                    href={`https://etherscan.io/tx/${state.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 font-mono text-xs"
                  >
                    {state.txHash.slice(0, 10)}...{state.txHash.slice(-8)}
                  </a>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Timestamp</span>
                <span className="text-gray-900">
                  {new Date(state.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3 mt-6">
        {state.status === 'failed' && (
          <>
            <button
              onClick={clearState}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Start Over
            </button>
            <button
              onClick={() => {
                // Retry logic here
                updateState({
                  status: 'pending',
                  progress: 0,
                  step: 'Retrying...'
                });
              }}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try Again
            </button>
          </>
        )}
        {state.status === 'success' && (
          <>
            <button
              onClick={clearState}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              New Bridge
            </button>
            <button
              onClick={() => {
                // View on explorer
                if (state.txHash) {
                  window.open(`https://etherscan.io/tx/${state.txHash}`, '_blank');
                }
              }}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              View on Explorer
            </button>
          </>
        )}
      </div>
    </div>
  );
};
