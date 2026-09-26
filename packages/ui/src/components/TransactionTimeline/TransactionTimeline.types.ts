export type BridgeStageId =
  | 'SOURCE_APPROVAL'
  | 'SOURCE_BURN_LOCK'
  | 'RELAYER_RELAY'
  | 'DESTINATION_MINT_CLAIM';

export type StageStatus = 'pending' | 'active' | 'completed' | 'error';

export type ChainType = 'stellar' | 'evm' | 'ethereum' | string;

export interface ExplorerLink {
  txHash: string;
  chain?: ChainType;
  label?: string;
  url?: string;
}

export interface TimelineStage {
  id: BridgeStageId;
  title: string;
  description?: string;
  status: StageStatus;
  timestamp?: string | number;
  explorerLink?: ExplorerLink;
  error?: string;
}

export interface TransactionTimelineProps {
  stages: TimelineStage[];
  currentStageId?: BridgeStageId;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  onExplorerClick?: (link: ExplorerLink) => void;
  ariaLabel?: string;
}

export function getBlockExplorerUrl(txHash: string, chain: ChainType = 'evm', customUrl?: string): string {
  if (customUrl) {
    return customUrl.replace('{txHash}', txHash);
  }
  const lowerChain = chain.toLowerCase();
  if (lowerChain === 'stellar' || lowerChain === 'soroban') {
    return `https://stellarexpert.io/public/mainnet/tx/${txHash}`;
  }
  return `https://etherscan.io/tx/${txHash}`;
}
