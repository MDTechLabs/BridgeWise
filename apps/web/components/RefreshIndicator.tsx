import React, { useEffect, useState } from 'react';

interface RefreshIndicatorProps {
  isRefreshing: boolean;
  lastRefreshed: Date | null;
  onClick: () => void;
  showAnimation?: boolean;
}

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  isRefreshing,
  lastRefreshed,
  onClick,
  showAnimation = false
}) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (showAnimation) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [showAnimation]);

  const getTimeSinceLastRefresh = () => {
    if (!lastRefreshed) return 'Never';
    
    const seconds = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return (
    <button
      className={`refresh-indicator ${animate ? 'refresh-indicator--pulse' : ''}`}
      onClick={onClick}
      disabled={isRefreshing}
      aria-label="Refresh quotes"
      title={`Last refreshed: ${getTimeSinceLastRefresh()} ago`}
    >
      <svg
        className={`refresh-indicator__icon ${isRefreshing ? 'refresh-indicator__icon--spinning' : ''}`}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C15.3019 3 18.1885 4.77814 19.7545 7.42909"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 7H21V3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      {isRefreshing && (
        <span className="refresh-indicator__text">Refreshing...</span>
      )}
    </button>
  );
};