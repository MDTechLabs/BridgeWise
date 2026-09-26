import React from 'react';
import {
  TransactionTimelineProps,
  BridgeStageId,
  getBlockExplorerUrl,
} from './TransactionTimeline.types';

export const DEFAULT_STAGES: { id: BridgeStageId; title: string; description: string }[] = [
  {
    id: 'SOURCE_APPROVAL',
    title: 'Source Approval',
    description: 'Approve token allowance on source chain',
  },
  {
    id: 'SOURCE_BURN_LOCK',
    title: 'Source Burn/Lock',
    description: 'Lock or burn tokens on source network',
  },
  {
    id: 'RELAYER_RELAY',
    title: 'Relayer Relay',
    description: 'Cross-chain relayer routing message',
  },
  {
    id: 'DESTINATION_MINT_CLAIM',
    title: 'Destination Mint/Claim',
    description: 'Mint or claim tokens on destination chain',
  },
];

export const TransactionTimeline: React.FC<TransactionTimelineProps> = ({
  stages,
  theme = 'auto',
  className = '',
  onExplorerClick,
  ariaLabel = 'Cross-chain transaction timeline',
}) => {
  const isDarkMode = theme === 'dark';

  const containerClasses = [
    'bw-transaction-timeline',
    'w-full max-w-2xl mx-auto p-4 rounded-xl transition-colors duration-200',
    isDarkMode ? 'bg-slate-900 text-slate-100 border border-slate-800' : 'bg-white text-slate-900 border border-slate-200 shadow-sm',
    className,
  ].filter(Boolean).join(' ');

  return (
    <nav className={containerClasses} aria-label={ariaLabel}>
      <ol className="relative flex flex-col md:flex-row justify-between items-start md:items-center space-y-6 md:space-y-0 md:space-x-4" role="list">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const isCurrent = stage.status === 'active';
          const isCompleted = stage.status === 'completed';
          const isError = stage.status === 'error';

          let badgeColor = 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

          if (isCompleted) {
            badgeColor = 'bg-emerald-500 text-white border-emerald-600 dark:bg-emerald-600';
          } else if (isCurrent) {
            badgeColor = 'bg-blue-600 text-white border-blue-700 animate-pulse dark:bg-blue-500';
          } else if (isError) {
            badgeColor = 'bg-rose-500 text-white border-rose-600 dark:bg-rose-600';
          }

          const explorerUrl = stage.explorerLink?.txHash
            ? getBlockExplorerUrl(
                stage.explorerLink.txHash,
                stage.explorerLink.chain || 'evm',
                stage.explorerLink.url
              )
            : null;

          const explorerLabel =
            stage.explorerLink?.label ||
            (stage.explorerLink?.chain?.toLowerCase() === 'stellar' ? 'StellarExpert' : 'Etherscan');

          return (
            <li
              key={stage.id}
              className="relative flex-1 flex flex-col items-start md:items-center w-full"
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {!isLast && (
                <div
                  aria-hidden="true"
                  className={`hidden md:block absolute top-5 left-1/2 w-full h-0.5 -z-0 transition-colors ${
                    isCompleted ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                />
              )}

              <div className="flex items-center space-x-3 md:space-x-0 md:flex-col md:items-center w-full z-10">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all duration-300 ${badgeColor}`}
                  aria-label={`${stage.title} status: ${stage.status}`}
                >
                  {isCompleted ? '✓' : isError ? '✕' : String(index + 1)}
                </div>

                <div className="flex-1 md:text-center mt-0 md:mt-2">
                  <h4 className="font-semibold text-sm leading-tight">{stage.title}</h4>
                  {stage.description ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stage.description}</p>
                  ) : null}
                  {isError && stage.error ? (
                    <p className="text-xs text-rose-500 font-medium mt-1">{stage.error}</p>
                  ) : null}

                  {explorerUrl && stage.explorerLink ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline mt-1 font-mono"
                      onClick={() => onExplorerClick && onExplorerClick(stage.explorerLink!)}
                      aria-label={`View transaction on ${explorerLabel}`}
                    >
                      {`${explorerLabel}: ${stage.explorerLink.txHash.slice(0, 6)}...${stage.explorerLink.txHash.slice(-4)}`}
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
