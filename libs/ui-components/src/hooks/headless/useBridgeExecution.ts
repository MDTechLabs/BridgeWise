import { useState, useCallback, useRef } from 'react';

export interface UseBridgeExecutionOptions {
  onStatusChange?: (status: string, details?: any) => void;
  onConfirmed?: (details: any) => void;
  onFailed?: (error: any) => void;
}

export interface UseBridgeExecutionReturn {
  status: string;
  progress: number;
  step: string;
  error: any;
  txHash: string | null;
  isPending: boolean;
  isConfirmed: boolean;
  isFailed: boolean;
  start: (txParams: any) => void;
  stop: () => void;
  retry: () => void;
  details: any;
}

export function useBridgeExecution(
  options: UseBridgeExecutionOptions = {}
): UseBridgeExecutionReturn {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('');
  const [error, setError] = useState<any>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';
  const isFailed = status === 'failed';

  const stop = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const start = useCallback((txParams: any) => {
    setStatus('pending');
    setProgress(0);
    setStep('Submitting transaction...');
    setError(null);
    setTxHash('0xMOCKHASH');
    setDetails({ ...txParams, started: true });
    // Simulate polling and status changes
    pollingRef.current = setTimeout(() => {
      setStatus('confirmed');
      setProgress(100);
      setStep('Transaction confirmed');
      setDetails((d: any) => ({ ...d, confirmed: true }));
      options.onStatusChange?.('confirmed', details);
      options.onConfirmed?.(details);
    }, 1500);
  }, [details, options]);

  const retry = useCallback(() => {
    if (details) start(details);
  }, [details, start]);

  return {
    status,
    progress,
    step,
    error,
    txHash,
    isPending,
    isConfirmed,
    isFailed,
    start,
    stop,
    retry,
    details,
  };
}
