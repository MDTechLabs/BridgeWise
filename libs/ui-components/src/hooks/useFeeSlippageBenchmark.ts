'use client'

import { useState, useEffect, useCallback } from 'react';

// Define the types locally to avoid import issues
export interface FeeSlippageBenchmark {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  avgFee: number;
  avgSlippagePercent: number;
  timestamp: Date;
  minFee?: number;
  maxFee?: number;
  minSlippagePercent?: number;
  maxSlippagePercent?: number;
  sampleSize?: number;
}

export type ChainId = string;
export type BridgeProvider = string;

// Define the props type for the hook
export interface FeeSlippageBenchmarkHookProps {
  token: string;
  sourceChain: string;
  destinationChain: string;
  bridgeName?: string; // Optional - if not provided, will fetch for all bridges
}

// Define the return type for the hook
export interface FeeSlippageBenchmarkHookReturn {
  benchmarks: FeeSlippageBenchmark[];
  loading: boolean;
  error: string | null;
  refreshBenchmarks: () => Promise<void>;
  latestBenchmark: FeeSlippageBenchmark | null;
  averageBenchmark: {
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null;
}

/**
 * Custom hook for accessing fee and slippage benchmark data
 */
export function useFeeSlippageBenchmark(props: FeeSlippageBenchmarkHookProps): FeeSlippageBenchmarkHookReturn {
  const [benchmarks, setBenchmarks] = useState<FeeSlippageBenchmark[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latestBenchmark, setLatestBenchmark] = useState<FeeSlippageBenchmark | null>(null);
  const [averageBenchmark, setAverageBenchmark] = useState<{
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null>(null);

  // Mock API call to fetch benchmark data
  // In a real implementation, this would connect to a backend API
  const fetchBenchmarks = useCallback(async (): Promise<FeeSlippageBenchmark[]> => {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // This is a mock implementation - in a real app, this would call an API
      // For demo purposes, return mock data
      const mockBenchmarks: FeeSlippageBenchmark[] = [
        {
          bridgeName: props.bridgeName || 'hop',
          sourceChain: props.sourceChain,
          destinationChain: props.destinationChain,
          token: props.token,
          avgFee: 0.45,
          avgSlippagePercent: 0.12,
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
          minFee: 0.3,
          maxFee: 0.8,
          minSlippagePercent: 0.05,
          maxSlippagePercent: 0.25,
          sampleSize: 150
        },
        {
          bridgeName: props.bridgeName || 'layerzero',
          sourceChain: props.sourceChain,
          destinationChain: props.destinationChain,
          token: props.token,
          avgFee: 0.65,
          avgSlippagePercent: 0.08,
          timestamp: new Date(Date.now() - 1800000), // 30 mins ago
          minFee: 0.4,
          maxFee: 1.2,
          minSlippagePercent: 0.03,
          maxSlippagePercent: 0.18,
          sampleSize: 95
        },
        {
          bridgeName: props.bridgeName || 'stellar',
          sourceChain: props.sourceChain,
          destinationChain: props.destinationChain,
          token: props.token,
          avgFee: 0.25,
          avgSlippagePercent: 0.05,
          timestamp: new Date(Date.now() - 600000), // 10 mins ago
          minFee: 0.15,
          maxFee: 0.4,
          minSlippagePercent: 0.02,
          maxSlippagePercent: 0.12,
          sampleSize: 210
        }
      ];

      // Filter by bridge name if specified
      const filteredBenchmarks = props.bridgeName 
        ? mockBenchmarks.filter(b => b.bridgeName === props.bridgeName)
        : mockBenchmarks;

      return filteredBenchmarks;
    } catch (err) {
      throw new Error('Failed to fetch benchmark data');
    }
  }, [props]);

  // Refresh benchmarks function
  const refreshBenchmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchBenchmarks();
      setBenchmarks(data);
      
      // Set latest benchmark (most recent)
      if (data.length > 0) {
        const sorted = [...data].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setLatestBenchmark(sorted[0]);
        
        // Calculate average
        const sumFee = data.reduce((sum: number, item: FeeSlippageBenchmark) => sum + item.avgFee, 0);
        const sumSlippage = data.reduce((sum: number, item: FeeSlippageBenchmark) => sum + item.avgSlippagePercent, 0);
        const avgFee = sumFee / data.length;
        const avgSlippage = sumSlippage / data.length;
        
        setAverageBenchmark({
          avgFee,
          avgSlippagePercent: avgSlippage,
          sampleSize: data.reduce((sum: number, item: FeeSlippageBenchmark) => sum + (item.sampleSize || 0), 0)
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [fetchBenchmarks]);

  // Initial load
  useEffect(() => {
    refreshBenchmarks();
  }, [refreshBenchmarks]);

  return {
    benchmarks,
    loading,
    error,
    refreshBenchmarks,
    latestBenchmark,
    averageBenchmark
  };
}