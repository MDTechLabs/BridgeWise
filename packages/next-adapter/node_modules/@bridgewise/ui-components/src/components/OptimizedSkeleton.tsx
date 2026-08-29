import React, { memo } from 'react';

interface OptimizedSkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  className?: string;
  'data-testid'?: string;
}

export const OptimizedSkeleton = memo(
  ({ 
    width = '100%', 
    height = 16, 
    borderRadius = 6, 
    className = '',
    'data-testid': testId 
  }: OptimizedSkeletonProps) => {
    return (
      <span
        className={`skeleton ${className}`}
        data-testid={testId}
        aria-hidden="true"
        style={{
          display: 'block',
          width,
          height,
          borderRadius,
          willChange: 'background-position',
        }}
      />
    );
  }
);

OptimizedSkeleton.displayName = 'OptimizedSkeleton';

export const OptimizedSkeletonCard = memo(() => (
  <div className="card" aria-hidden="true" style={{ contain: 'layout style paint' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
      <OptimizedSkeleton width={40} height={40} borderRadius={9999} />
      <div style={{ flex: 1 }}>
        <OptimizedSkeleton width="60%" height={14} />
        <div style={{ height: 6 }} />
        <OptimizedSkeleton width="40%" height={11} />
      </div>
    </div>
    <OptimizedSkeleton height={11} />
    <div style={{ height: 8 }} />
    <OptimizedSkeleton width="85%" height={11} />
    <div style={{ height: 16 }} />
    <OptimizedSkeleton width={80} height={28} borderRadius={8} />
  </div>
));

OptimizedSkeletonCard.displayName = 'OptimizedSkeletonCard';
