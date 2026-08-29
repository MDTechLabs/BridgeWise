/**
 * Refresh Status Component
 * 
 * Displays auto-refresh status, last update time, and manual refresh button.
 * Provides real-time visual feedback for data freshness.
 * 
 * Implementation Scope: libs/ui-components/src/
 */

import React, { useState, useEffect, useCallback } from 'react';

/**
 * Refresh status props
 */
export interface RefreshStatusProps {
  /** Last refresh timestamp */
  lastRefreshed: Date | null;
  /** Whether refresh is in progress */
  isRefreshing: boolean;
  /** Refresh interval in milliseconds */
  intervalMs?: number;
  /** Manual refresh callback */
  onRefresh?: () => Promise<void>;
  /** Show countdown timer */
  showCountdown?: boolean;
  /** Compact mode */
  compact?: boolean;
}

/**
 * Refresh Status Component - Shows refresh state and controls
 */
const RefreshStatus: React.FC<RefreshStatusProps> = ({
  lastRefreshed,
  isRefreshing,
  intervalMs = 15000,
  onRefresh,
  showCountdown = true,
  compact = false,
}) => {
  const [countdown, setCountdown] = useState(intervalMs / 1000);
  const [timeAgo, setTimeAgo] = useState<string>('');

  // Update countdown timer
  useEffect(() => {
    if (!showCountdown || isRefreshing) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return intervalMs / 1000;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showCountdown, isRefreshing, intervalMs, lastRefreshed]);

  // Update time ago text
  useEffect(() => {
    if (!lastRefreshed) {
      setTimeAgo('Never');
      return;
    }

    const update = () => {
      const seconds = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);

      if (seconds < 5) setTimeAgo('Just now');
      else if (seconds < 60) setTimeAgo(`${seconds}s ago`);
      else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
      else setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
    };

    update();
    const timer = setInterval(update, 5000);
    return () => clearInterval(timer);
  }, [lastRefreshed]);

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    if (onRefresh && !isRefreshing) {
      try {
        await onRefresh();
        setCountdown(intervalMs / 1000);
      } catch (error) {
        console.error('Refresh failed:', error);
      }
    }
  }, [onRefresh, isRefreshing, intervalMs]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {isRefreshing ? (
          <span className="flex items-center gap-1 text-blue-600">
            <RefreshIcon className="w-3 h-3 animate-spin" />
            Updating...
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-500">
            <CheckIcon className="w-3 h-3 text-green-500" />
            {timeAgo}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {isRefreshing ? (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900">
            <RefreshIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900">
            <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
        )}
      </div>

      {/* Status text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {isRefreshing ? 'Updating...' : 'Live Data'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {lastRefreshed ? (
            <>Last updated: {timeAgo}</>
          ) : (
            <>Waiting for data...</>
          )}
        </div>
      </div>

      {/* Countdown and refresh button */}
      <div className="flex items-center gap-2">
        {showCountdown && !isRefreshing && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Refresh in {countdown}s
          </div>
        )}

        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-1 text-xs font-medium rounded-md transition-colors bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh now"
          >
            <RefreshIcon className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Refresh Icon SVG
 */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

/**
 * Check Icon SVG
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

export default RefreshStatus;
