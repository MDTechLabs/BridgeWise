/**
 * Headless Component Example
 * Shows how to use the headless TransactionHeartbeat with custom styling
 */

import { TransactionHeartbeatHeadless } from '@bridgewise/ui-components/headless';
import { TransactionProvider } from '@bridgewise/ui-components';

/**
 * Example 1: Minimal custom notification
 */
export function MinimalHeartbeat() {
  return (
    <TransactionHeartbeatHeadless>
      {({ state, clearState, isSuccess, isFailed, isPending }) => (
        <div className="fixed top-4 right-4 p-4 bg-white shadow-lg rounded-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">
                {isSuccess ? '✅ Done!' : isFailed ? '❌ Failed' : '⏳ Processing...'}
              </h3>
              <p className="text-sm text-gray-600">{state.step}</p>
            </div>
            <button onClick={clearState} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
          <progress value={state.progress} max={100} className="w-full mt-2" />
        </div>
      )}
    </TransactionHeartbeatHeadless>
  );
}

/**
 * Example 2: Toast-style notification
 */
export function ToastHeartbeat() {
  return (
    <TransactionHeartbeatHeadless>
      {({ state, clearState, isSuccess, isFailed }) => {
        const bgColor = isSuccess ? 'bg-green-50' : isFailed ? 'bg-red-50' : 'bg-blue-50';
        const textColor = isSuccess ? 'text-green-900' : isFailed ? 'text-red-900' : 'text-blue-900';

        return (
          <div className={`fixed bottom-4 left-4 p-4 ${bgColor} ${textColor} rounded-lg shadow-lg max-w-sm`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {isSuccess ? '🎉' : isFailed ? '💔' : '🔄'}
              </span>
              <div className="flex-1">
                <p className="font-medium">{state.step}</p>
                <div className="mt-2 bg-white/50 rounded-full h-2">
                  <div
                    className="h-full bg-current rounded-full transition-all"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
              <button onClick={clearState} className="hover:opacity-70">
                ✕
              </button>
            </div>
          </div>
        );
      }}
    </TransactionHeartbeatHeadless>
  );
}

/**
 * Example 3: Compact progress bar
 */
export function CompactHeartbeat() {
  return (
    <TransactionHeartbeatHeadless>
      {({ state, isSuccess, isFailed }) => {
        const color = isSuccess ? '#22c55e' : isFailed ? '#ef4444' : '#3b82f6';

        return (
          <div
            className="fixed top-0 left-0 right-0 h-1 transition-all"
            style={{
              backgroundColor: color,
              width: `${state.progress}%`,
              opacity: state.progress === 100 ? 0 : 1,
            }}
          />
        );
      }}
    </TransactionHeartbeatHeadless>
  );
}

/**
 * Complete app example
 */
export function App() {
  return (
    <TransactionProvider>
      <div>
        <h1>My Application</h1>
        {/* Choose your style */}
        <MinimalHeartbeat />
        {/* or <ToastHeartbeat /> */}
        {/* or <CompactHeartbeat /> */}
      </div>
    </TransactionProvider>
  );
}
