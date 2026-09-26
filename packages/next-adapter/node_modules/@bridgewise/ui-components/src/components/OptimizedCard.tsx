import React, { memo, forwardRef } from 'react';
import { cn } from '../utils/cn';

interface OptimizedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isLoading?: boolean;
  'data-testid'?: string;
}

export const OptimizedCard = memo(
  forwardRef<HTMLDivElement, OptimizedCardProps>(
    ({ children, className = '', onClick, isLoading = false, 'data-testid': testId }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(
            'card',
            onClick && 'cursor-pointer hover:shadow-md transition-shadow duration-200',
            isLoading && 'opacity-70 pointer-events-none',
            className
          )}
          onClick={onClick}
          data-testid={testId}
          style={{ contain: 'layout style paint' }}
        >
          {children}
        </div>
      );
    }
  )
);

OptimizedCard.displayName = 'OptimizedCard';
