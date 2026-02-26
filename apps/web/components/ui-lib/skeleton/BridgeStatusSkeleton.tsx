import React from 'react';

interface BridgeStatusSkeletonProps {
  className?: string;
}

export const BridgeStatusSkeleton: React.FC<BridgeStatusSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 shadow-sm animate-pulse ${className}`}>
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-6 bg-gray-200 rounded w-32"></div>
          <div className="h-4 bg-gray-200 rounded w-48"></div>
        </div>
        <div className="h-8 bg-gray-200 rounded w-8"></div>
      </div>

      {/* Progress bar skeleton */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
          <div className="h-4 bg-gray-200 rounded w-12"></div>
        </div>
        <div className="h-2 bg-gray-200 rounded-full w-full"></div>
      </div>

      {/* Status steps skeleton */}
      <div className="space-y-3 mb-6">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-32 mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction details skeleton */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-4 bg-gray-200 rounded w-16"></div>
          <div className="h-4 bg-gray-200 rounded w-28"></div>
        </div>
        <div className="flex justify-between">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
          <div className="h-4 bg-gray-200 rounded w-24"></div>
        </div>
        <div className="flex justify-between">
          <div className="h-4 bg-gray-200 rounded w-14"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>

      {/* Action buttons skeleton */}
      <div className="flex space-x-3 mt-6">
        <div className="h-10 bg-gray-200 rounded-lg flex-1"></div>
        <div className="h-10 bg-gray-200 rounded-lg flex-1"></div>
      </div>
    </div>
  );
};
