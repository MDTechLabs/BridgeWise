export interface SlippageAlertConfig {
  maxSlippagePercent?: number; // default 1%
  notifyUser?: boolean;
  blockOnExceed?: boolean;
  onAlert?: (data: SlippageAlertData) => void;
}

export interface SlippageAlertData {
  bridge: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  slippage: number;
  threshold: number;
  severity: SlippageSeverity;
  timestamp: Date;
}

export type SlippageSeverity = 'warning' | 'critical';

export interface SlippageAlert extends SlippageAlertData {
  id: string;
  dismissed: boolean;
}

export interface BridgeQuote {
  bridge: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  expectedOutput: number;
  actualOutput: number;
  slippagePercent: number;
}

export interface UseSlippageAlertReturn {
  alerts: SlippageAlert[];
  activeAlerts: SlippageAlert[];
  isBlocked: boolean;
  highestSlippage: number | null;
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
  checkSlippage: (quote: BridgeQuote) => SlippageAlert | null;
}
