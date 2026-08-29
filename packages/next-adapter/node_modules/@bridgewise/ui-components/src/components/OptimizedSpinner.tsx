import React, { memo } from 'react';

interface OptimizedSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
  'data-testid'?: string;
}

const sizeMap = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 36,
  xl: 48,
};

export const OptimizedSpinner = memo(
  ({ size = 'md', label = 'Loading...', className = '', 'data-testid': testId }: OptimizedSpinnerProps) => {
    const spinnerSize = sizeMap[size];
    
    return (
      <span
        role="status"
        aria-label={label}
        aria-live="polite"
        className={className}
        data-testid={testId}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg
          width={spinnerSize}
          height={spinnerSize}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="spinner"
          style={{
            animation: 'spin 0.8s linear infinite',
            transform: 'translateZ(0)', // Force GPU acceleration
          }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.2"
          />
          <path
            d="M12 2a10 10 0 0 1 0 20"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
);

OptimizedSpinner.displayName = 'OptimizedSpinner';
