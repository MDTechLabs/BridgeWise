/**
 * Next.js Dynamic Import Examples for BridgeWise Components
 * 
 * These examples show how to properly import BridgeWise components
 * in Next.js applications to avoid SSR issues.
 */

import dynamic from 'next/dynamic';
import { BridgeQuoteParams } from '@bridgewise/react';

// Example 1: Dynamic import with SSR disabled (Recommended)
export const BridgeCompareDynamic = dynamic(
  () => import('../components/BridgeCompare').then(mod => mod.BridgeCompare),
  { 
    ssr: false,
    loading: () => <div>Loading Bridge Compare...</div>
  }
);

// Example 2: Dynamic import with custom loading component
export const BridgeCompareWithLoading = dynamic(
  () => import('../components/BridgeCompare').then(mod => mod.BridgeCompare),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-2">
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }
);

// Example 3: Transaction Heartbeat with SSR disabled
export const TransactionHeartbeatDynamic = dynamic(
  () => import('../components/TransactionHeartbeat').then(mod => mod.TransactionHeartbeat),
  { 
    ssr: false,
    loading: () => null // Don't show loading for heartbeat
  }
);

// Example 4: Hook-only dynamic import (if needed)
export const BridgeQuotesHookExample = dynamic(
  () => import('../components/ui-lib/hooks/useBridgeQuotes').then(mod => ({ default: mod.useBridgeQuotes })),
  { ssr: false }
);

// Example 5: Complete page component using dynamic imports
interface BridgePageProps {
  initialParams: BridgeQuoteParams;
}

export const BridgePage = ({ initialParams }: BridgePageProps) => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Bridge Assets</h1>
      
      <BridgeCompareDynamic
        initialParams={initialParams}
        onQuoteSelect={(quoteId) => {
          console.log('Selected quote:', quoteId);
        }}
        refreshInterval={15000}
        autoRefresh={true}
      />
      
      <TransactionHeartbeatDynamic />
    </div>
  );
};

// Example 6: App Router usage (app/bridge/page.tsx)
export default function BridgePageRoute() {
  const initialParams: BridgeQuoteParams = {
    amount: '100',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    sourceToken: 'USDC',
    destinationToken: 'USDC',
    slippageTolerance: 1.0
  };

  return <BridgePage initialParams={initialParams} />;
}

// Example 7: Pages Router usage (pages/bridge.tsx)
export { BridgePageRoute as default };

// Example 8: With error boundary
import { ErrorBoundary } from 'react-error-boundary';

export const SafeBridgeCompare = () => (
  <ErrorBoundary
    fallback={
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <h3 className="text-red-800 font-semibold">Bridge Component Error</h3>
        <p className="text-red-600">Unable to load bridge comparison component.</p>
      </div>
    }
  >
    <BridgeCompareDynamic
      initialParams={{
        amount: '100',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: 'USDC',
        destinationToken: 'USDC'
      }}
    />
  </ErrorBoundary>
);
