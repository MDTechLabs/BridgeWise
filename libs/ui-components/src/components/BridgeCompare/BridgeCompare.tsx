
import React from 'react';
import { useFeeSlippageBenchmark } from '../../hooks/useFeeSlippageBenchmark';
import { useBridgeLiquidity } from '../../hooks/useBridgeLiquidity';
import { prioritizeRoutesByLiquidity } from '../../liquidity/monitor';
import type { BridgeRoute, ChainId } from '../../../../bridge-core/src/types';

interface BridgeCompareProps {
  routes: BridgeRoute[];
  token: string;
  sourceChain: string;
  destinationChain: string;
  showBenchmarkComparison?: boolean;
  minLiquidityThreshold?: number;
  onRouteSelect?: (route: BridgeRoute) => void;
}

// Define the types locally to avoid import issues
interface ChainIdType {
  sourceChain: string;
  destinationChain: string;
}

const BridgeCompare: React.FC<BridgeCompareProps> = ({
  routes,
  token,
  sourceChain,
  destinationChain,
  showBenchmarkComparison = true,
  minLiquidityThreshold = 0,
  onRouteSelect
}: BridgeCompareProps) => {
  // Get benchmark data for comparison
  const { 
    benchmarks, 
    loading: benchmarkLoading, 
    error: benchmarkError,
    averageBenchmark 
  } = useFeeSlippageBenchmark({
    token,
    sourceChain: sourceChain as ChainId,
    destinationChain: destinationChain as ChainId,
  });

  const {
    liquidity,
    loading: liquidityLoading,
    errors: liquidityErrors,
    usedFallback,
    refreshLiquidity,
  } = useBridgeLiquidity({
    token,
    sourceChain,
    destinationChain,
    refreshIntervalMs: 30000,
  });

  const orderedRoutes = prioritizeRoutesByLiquidity(routes, liquidity);

  const getLiquidityForProvider = (provider: string) =>
    liquidity.find((item) => item.bridgeName.toLowerCase() === provider.toLowerCase());

  // Helper to get benchmark for a specific bridge
  const getBenchmarkForBridge = (provider: string) => {
    return benchmarks.find(b => b.bridgeName === provider);
  };

  // Helper to calculate difference from benchmark
  const getFeeDifference = (routeFee: number, benchmarkFee: number) => {
    const diff = routeFee - benchmarkFee;
    const percentDiff = ((diff / benchmarkFee) * 100).toFixed(2);
    
    return {
      absolute: diff,
      percent: parseFloat(percentDiff),
      isBetter: diff <= 0
    };
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bridge Comparison</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Compare routes across different bridges</p>
      </div>

      {/* Benchmark Summary */}
      {showBenchmarkComparison && averageBenchmark && !benchmarkLoading && !benchmarkError && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Historical Average</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-blue-600 dark:text-blue-300">Avg Fee</p>
              <p className="font-bold text-blue-900 dark:text-blue-100">{averageBenchmark.avgFee.toFixed(4)}%</p>
            </div>
            <div>
              <p className="text-sm text-blue-600 dark:text-blue-300">Avg Slippage</p>
              <p className="font-bold text-blue-900 dark:text-blue-100">{averageBenchmark.avgSlippagePercent.toFixed(4)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Routes List */}
      <div className="space-y-4">
        {orderedRoutes.map((route, index) => {
          const benchmark = getBenchmarkForBridge(route.provider);
          const feeDiff = benchmark 
            ? getFeeDifference(route.feePercentage, benchmark.avgFee) 
            : null;
          const routeLiquidity = getLiquidityForProvider(route.provider);
          const requiredAmount = parseFloat(route.inputAmount);
          const threshold = requiredAmount + minLiquidityThreshold;
          const hasInsufficientLiquidity =
            !!routeLiquidity && routeLiquidity.availableAmount < threshold;

          return (
            <div 
              key={route.id || index}
              className={`border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md ${
                onRouteSelect 
                  ? 'hover:border-blue-500' 
                  : 'border-gray-200 dark:border-gray-700'
              } ${
                route.id === (routes[0]?.id) 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' 
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              onClick={() => onRouteSelect && onRouteSelect(route)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white capitalize">
                    {route.provider} Bridge
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    {sourceChain} → {destinationChain}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {parseFloat(route.outputAmount).toLocaleString()} {token}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Estimated: ~{Math.floor(route.estimatedTime / 60)}m {route.estimatedTime % 60}s
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Fee</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {route.feePercentage.toFixed(4)}%
                  </p>
                  
                  {showBenchmarkComparison && feeDiff && (
                    <p className={`text-xs ${feeDiff.isBetter ? 'text-green-600' : 'text-red-600'}`}>
                      {feeDiff.percent > 0 ? '+' : ''}{feeDiff.percent.toFixed(2)}% vs avg
                    </p>
                  )}
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Reliability</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {(route.reliability * 100).toFixed(0)}%
                  </p>
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Max Slippage</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {((parseFloat(route.inputAmount) - parseFloat(route.minAmountOut)) / parseFloat(route.inputAmount) * 100).toFixed(4)}%
                  </p>
                </div>
              </div>

              <div className="mt-2 text-xs">
                {routeLiquidity ? (
                  <p className={hasInsufficientLiquidity ? 'text-red-600' : 'text-green-600'}>
                    Liquidity: {routeLiquidity.availableAmount.toLocaleString()} {token}
                    {hasInsufficientLiquidity ? ' (insufficient for this route)' : ''}
                  </p>
                ) : (
                  <p className="text-amber-600">Liquidity unavailable for this route</p>
                )}
              </div>

              {onRouteSelect && (
                <div className="mt-4">
                  <button
                    disabled={hasInsufficientLiquidity}
                    className={`w-full py-2 px-4 text-white rounded-md transition-colors ${
                      hasInsufficientLiquidity
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    Select Route
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void refreshLiquidity()}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          Refresh liquidity
        </button>
        {usedFallback && <span className="text-xs text-amber-600">Using cached liquidity data</span>}
      </div>

      {/* Loading/Error States */}
      {benchmarkLoading && showBenchmarkComparison && (
        <div className="mt-4 text-center text-gray-500 dark:text-gray-400">
          Loading benchmark data...
        </div>
      )}

      {benchmarkError && showBenchmarkComparison && (
        <div className="mt-4 text-center text-red-500">
          Error loading benchmark data: {benchmarkError}
        </div>
      )}

      {liquidityLoading && (
        <div className="mt-2 text-center text-gray-500 dark:text-gray-400">Loading liquidity data...</div>
      )}

      {liquidityErrors.length > 0 && (
        <div className="mt-2 text-center text-amber-600">
          Liquidity providers unavailable: {liquidityErrors.map((error) => error.bridgeName).join(', ')}
        </div>
      )}

      {routes.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No routes available for comparison
        </div>
      )}
    </div>
  );
};

export default BridgeCompare;