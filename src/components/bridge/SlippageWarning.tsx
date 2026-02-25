"use client";

import React from "react";
import { AlertTriangle, Droplets } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SlippageResult, SLIPPAGE_WARNING_THRESHOLD } from "@/hooks/useSlippage";

interface SlippageWarningProps {
  slippage: SlippageResult;
  warningThreshold?: number;
  className?: string;
}

export function SlippageWarning({
  slippage,
  warningThreshold = SLIPPAGE_WARNING_THRESHOLD,
  className = "",
}: SlippageWarningProps) {
  const { isHighSlippage, isLowLiquidity, slippagePercent, hasWarning } =
    slippage;

  if (!hasWarning) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* High Slippage Warning */}
      {isHighSlippage && (
        <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-500 font-semibold">
            High Slippage Warning
          </AlertTitle>
          <AlertDescription className="text-red-400 text-sm">
            Current slippage is{" "}
            <span className="font-bold">{slippagePercent.toFixed(2)}%</span>,
            which exceeds the {warningThreshold}% threshold. You may receive
            significantly less than expected. Consider splitting your transaction
            or waiting for better market conditions.
          </AlertDescription>
        </Alert>
      )}

      {/* Low Liquidity Warning */}
      {isLowLiquidity && (
        <Alert
          variant="destructive"
          className="border-yellow-500/50 bg-yellow-500/10"
        >
          <Droplets className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-500 font-semibold">
            Low Liquidity
          </AlertTitle>
          <AlertDescription className="text-yellow-400 text-sm">
            This route has low liquidity depth. Large transactions may cause
            higher slippage and price impact. Consider using a smaller amount or
            an alternative route.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
