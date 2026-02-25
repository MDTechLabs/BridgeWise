"use client";

/**
 * SlippageSection — Drop this component into your bridge form wherever
 * you display route details. It reacts automatically whenever
 * `transferAmount` or `route` changes.
 *
 * Usage:
 *   <SlippageSection
 *     transferAmount={amount}
 *     route={selectedRoute}
 *     outputSymbol="USDC"
 *   />
 */

import React from "react";
import { useSlippage, SlippageRoute } from "@/hooks/useSlippage";
import { SlippageDisplay } from "./SlippageDisplay";
import { SlippageWarning } from "./SlippageWarning";

interface SlippageSectionProps {
  transferAmount: string;
  route: SlippageRoute | null | undefined;
  outputSymbol?: string;
  /** Override the default 1% warning threshold */
  warningThreshold?: number;
  /** Override the default $10,000 low-liquidity threshold */
  lowLiquidityThreshold?: number;
  className?: string;
}

export function SlippageSection({
  transferAmount,
  route,
  outputSymbol,
  warningThreshold,
  lowLiquidityThreshold,
  className = "",
}: SlippageSectionProps) {
  const slippage = useSlippage(
    route,
    transferAmount,
    warningThreshold,
    lowLiquidityThreshold
  );

  if (!route || !transferAmount || Number(transferAmount) <= 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <SlippageWarning slippage={slippage} warningThreshold={warningThreshold} />
      <SlippageDisplay slippage={slippage} outputSymbol={outputSymbol} />
    </div>
  );
}
