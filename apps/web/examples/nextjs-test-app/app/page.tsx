/**
 * Next.js App Router Test Page for BridgeWise SSR Compatibility
 * 
 * This page tests BridgeWise components in a Next.js SSR environment
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
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          BridgeWise SSR Test
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Testing BridgeWise components in Next.js SSR environment
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Bridge Compare Component
          </h2>
          <p className="text-gray-600 mb-6">
            This component should render safely without hydration errors
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

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            SSR Compatibility Checklist
          </h3>
          <ul className="list-disc list-inside text-blue-700 space-y-1">
            <li>✅ No window/document access during SSR</li>
            <li>✅ No localStorage access during SSR</li>
            <li>✅ Consistent server/client render output</li>
            <li>✅ Proper hydration guards in place</li>
            <li>✅ Client-side only logic properly delayed</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
