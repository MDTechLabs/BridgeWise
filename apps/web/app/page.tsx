
'use client';

import { useEffect } from 'react';
import { TransactionHeartbeat, useTransaction } from '@bridgewise/ui-components';

function TransactionDemo() {
  const { state, updateState, startTransaction, clearState } = useTransaction();

  // Simulate progress
  useEffect(() => {
    if (state.status !== 'pending') return;

    const interval = setInterval(() => {
      if (state.progress >= 100) {
        updateState({ status: 'success', progress: 100, step: 'Transfer Complete!' });
        clearInterval(interval);
        return;
      }

      let nextProgress = state.progress + 5;
      let nextStep = state.step;

      if (nextProgress > 20 && nextProgress < 40) nextStep = 'Confirming on source chain...';
      if (nextProgress > 50 && nextProgress < 70) nextStep = 'Bridging assets...';
      if (nextProgress > 80) nextStep = 'Finalizing on destination...';

      updateState({ progress: Math.min(nextProgress, 100), step: nextStep });
    }, 800);

    return () => clearInterval(interval);
  }, [state, updateState]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-50 dark:bg-zinc-900">
      <main className="flex flex-col items-center gap-8">
        <h1 className="text-4xl font-bold text-center text-zinc-900 dark:text-zinc-100">
          BridgeWise Transaction Heartbeat Demo
        </h1>

        <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
          Click "Start Transaction" to simulate a bridge transfer. Then refresh the page to verify that the state persists and the heartbeat component reappears.
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => startTransaction('tx-' + Date.now())}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition active:scale-95"
          >
            Start Transaction
          </button>
          <button
            onClick={clearState}
            className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95"
          >
            Clear State
          </button>
        </div>

        <TransactionHeartbeat />
      </main>
    </div>
  );
}

export default function Home() {
  return <TransactionDemo />;
}
