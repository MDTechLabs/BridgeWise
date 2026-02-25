"use client";

import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { SlippageResult } from "@/hooks/useSlippage";

interface SlippageDisplayProps {
  slippage: SlippageResult;
  outputSymbol?: string;
  className?: string;
}

export function SlippageDisplay({
  slippage,
  outputSymbol = "",
  className = "",
}: SlippageDisplayProps) {
  const { slippagePercent, minimumReceived, isHighSlippage, hasWarning } =
    slippage;

  const slippageColor = isHighSlippage
    ? "text-red-500"
    : slippagePercent > 0.5
    ? "text-yellow-500"
    : "text-green-500";

  return (
    <div className={`flex flex-col gap-2 text-sm ${className}`}>
      {/* Slippage Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>Slippage</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Slippage is the difference between the expected and actual
                  amount received. High slippage may result in receiving
                  significantly less than expected. This can occur during high
                  volatility or low liquidity conditions.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <span className={`font-medium ${slippageColor}`}>
          {hasWarning && (
            <span className="mr-1" aria-label="warning">
              ⚠️
            </span>
          )}
          {slippagePercent.toFixed(2)}%
        </span>
      </div>

      {/* Minimum Received Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>Minimum received</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  The minimum amount you are guaranteed to receive after
                  accounting for slippage. If the actual output falls below this
                  value, the transaction will revert.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <span className="font-medium text-foreground">
          {minimumReceived} {outputSymbol}
        </span>
      </div>
    </div>
  );
}
