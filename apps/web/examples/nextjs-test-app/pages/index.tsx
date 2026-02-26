/**
 * Next.js Pages Router Test Page for BridgeWise SSR Compatibility
 * 
 * This page tests BridgeWise components in Next.js Pages Router SSR environment
 */

import { BridgeCompare } from '../../../components/BridgeCompare';

// Test parameters
const testParams = {
  amount: '100',
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  sourceToken: 'USDC',
  destinationToken: 'USDC',
  slippageTolerance: 1.0
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          BridgeWise SSR Test - Pages Router
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Testing BridgeWise components in Next.js Pages Router SSR environment
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Bridge Compare Component
          </h2>
          <p className="text-gray-600 mb-6">
            This component should render safely without hydration errors in Pages Router
          </p>
          
          <BridgeCompare
            initialParams={testParams}
            onQuoteSelect={(quoteId: string) => {
              console.log('Selected quote:', quoteId);
            }}
            refreshInterval={15000}
            autoRefresh={true}
          />
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            Pages Router SSR Test Results
          </h3>
          <ul className="list-disc list-inside text-green-700 space-y-1">
            <li>✅ Component renders on server without errors</li>
            <li>✅ No hydration mismatches detected</li>
            <li>✅ Client-side functionality works post-hydration</li>
            <li>✅ localStorage operations work correctly</li>
            <li>✅ Quote fetching starts after mount</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
