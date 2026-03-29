
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BridgeWiseProvider,
  TransactionHeartbeat,
  useTransaction,
  BridgeStatus,
} from '@bridgewise/ui-components';
import VersionDisplay from '../components/VersionDisplay';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const customTheme = {
  primaryColor: '#22c55e',
  secondaryColor: '#0f172a',
  backgroundColor: '#020617',
  textColor: '#e5e7eb',
  borderRadius: '16px',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  spacingUnit: '0.9rem',
};

function TransactionDemo() {
  const { t } = useTranslation();
  const { state, updateState, startTransaction, clearState, executeBatch } = useTransaction();
  const [batchResult, setBatchResult] = useState<{ id: string; txHash: string; success: boolean; error?: string; }[] | null>(null);

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

      if (nextProgress > 20 && nextProgress < 40) nextStep = t('app.statusConfirming');
      if (nextProgress > 50 && nextProgress < 70) nextStep = t('app.statusBridging');
      if (nextProgress > 80) nextStep = t('app.statusFinalizing');

      updateState({ progress: Math.min(nextProgress, 100), step: nextStep });
    }, 800);

    return () => clearInterval(interval);
  }, [state, updateState, t]);

  return (
    <BridgeWiseProvider theme={customTheme} defaultMode="dark">
      <div className="flex min-h-screen flex-col items-center justify-center gap-12 p-10 bg-zinc-50 dark:bg-black">
        <main className="flex flex-col items-center gap-8 max-w-3xl">
          <LanguageSwitcher />
          <h1 className="text-4xl font-bold text-center text-zinc-900 dark:text-zinc-100">
            {t('app.title')}
          </h1>

          <p className="max-w-xl text-center text-zinc-600 dark:text-zinc-400">
            {t('app.description')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => startTransaction('tx-' + Date.now())}
              className="px-6 py-3 rounded-lg text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition"
            >
              {t('app.startTransaction')}
            </button>
            <button
              onClick={clearState}
              className="px-6 py-3 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition"
            >
              {t('app.clearState')}
            </button>
            <button
              onClick={async () => {
                const result = await executeBatch([
                  {
                    id: `batch-${Date.now()}-1`,
                    bridgeName: 'demo',
                    sourceChain: 'ethereum',
                    destinationChain: 'polygon',
                    sourceToken: 'ETH',
                    destinationToken: 'USDC',
                    amount: 1.23,
                    fee: 0.02,
                    slippagePercent: 0.5,
                    account: '0x000',
                    txHash: `0x${Math.random().toString(16).slice(2)}1`,
                  },
                  {
                    id: `batch-${Date.now()}-2`,
                    bridgeName: 'demo',
                    sourceChain: 'polygon',
                    destinationChain: 'ethereum',
                    sourceToken: 'USDC',
                    destinationToken: 'ETH',
                    amount: 10.5,
                    fee: 0.1,
                    slippagePercent: 0.5,
                    account: '0x000',
                    txHash: `0x${Math.random().toString(16).slice(2)}2`,
                  },
                  {
                    id: `batch-${Date.now()}-3`,
                    bridgeName: 'demo',
                    sourceChain: 'avax',
                    destinationChain: 'optimism',
                    sourceToken: 'USDC',
                    destinationToken: 'DAI',
                    amount: 50,
                    fee: 0.25,
                    slippagePercent: 0.5,
                    account: '0x000',
                    txHash: `0x${Math.random().toString(16).slice(2)}3`,
                  },
                ]);
                setBatchResult(result.results);
              }}
              className="px-6 py-3 rounded-lg text-sm font-medium border border-blue-300 text-blue-700 dark:border-blue-500 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 active:scale-95 transition"
            >
              Run Batch (3)
            </button>
          </div>

          {batchResult && (
            <div className="w-full rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <h3 className="font-semibold mb-2">Batch result</h3>
              <ul className="space-y-1">
                {batchResult.map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{item.id}</span>
                    <span>
                      {item.success ? '✅ success' : '❌ failed'}
                      {item.error ? `: ${item.error}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="grid w-full gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/60 p-4 shadow-sm">
              <h2 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-50">
                {t('app.inlineStatusTitle')}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                {t('app.inlineStatusText')}
              </p>
              <BridgeStatus
                txHash={state.txHash || '0x0000000000000000000000000000000000000000'}
                bridgeName="demo"
                sourceChain="ethereum"
                destinationChain="polygon"
                amount={123.45}
                token="USDC"
                slippagePercent={0.5}
                estimatedTimeSeconds={300}
                detailed
              />
            </div>

            <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/60 p-4 shadow-sm">
              <h2 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-50">
                {t('app.componentOverridesTitle')}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                {t('app.componentOverridesText')}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {t('app.componentOverridesHint')}
              </p>
            </div>
          </section>

          {/* SDK Version Display */}
          <footer className="w-full flex justify-center mt-8">
            <VersionDisplay 
              showDetails={false}
              enableLogging={true}
              onClick={(v) => console.log('Version clicked:', v)}
            />
          </footer>

          <TransactionHeartbeat className="left-4 right-auto" />
        </main>
      </div>
    </BridgeWiseProvider>
  );
}

export default function Home() {
  return <TransactionDemo />;
}
