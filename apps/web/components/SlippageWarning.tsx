import React from 'react';

interface SlippageWarningProps {
  lastRefreshed: Date | null;
  quotes: any[];
  refreshThreshold: number;
  onRefresh: () => void;
}

export const SlippageWarning: React.FC<SlippageWarningProps> = ({
  lastRefreshed,
  quotes,
  refreshThreshold,
  onRefresh
}) => {
  if (!lastRefreshed || quotes.length === 0) {
    return null;
  }

  const timeSinceRefresh = Date.now() - lastRefreshed.getTime();
  const isOutdated = timeSinceRefresh > refreshThreshold;

  return (
    <div className={`rounded-lg p-4 mb-4 ${
      isOutdated 
        ? 'bg-yellow-50 border border-yellow-200' 
        : 'bg-green-50 border border-green-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isOutdated ? (
            <>
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100 4m0-4a2 2 0 110 4" />
              </svg>
              <span className="text-yellow-800 font-medium">
                Quotes may be outdated
              </span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4 4-4-4-2-2-4-4 4-4 2 2 4 4m-6-2a2 2 0 00-4 4v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2z" />
              </svg>
              <span className="text-green-800 font-medium">
                Quotes are fresh
              </span>
            </>
          )}
        </div>
        
        <div className="text-sm text-gray-600">
          Updated {Math.floor(timeSinceRefresh / 1000)}s ago
        </div>
      </div>
      
      {isOutdated && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-yellow-700">
            Prices may have changed. Refresh for latest quotes.
          </p>
          <button
            onClick={onRefresh}
            className="px-3 py-1 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm font-medium"
          >
            Refresh Now
          </button>
        </div>
      )}
    </div>
  );
};
