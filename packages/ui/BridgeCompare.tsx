import React from "react";
import { useSlippageAlert } from "../bridge-core/useSlippageAlert";

interface BridgeCompareProps {
  token: string;
  sourceChain: string;
  destinationChain: string;
  maxSlippagePercent: number;
}

const BridgeCompare: React.FC<BridgeCompareProps> = ({
  token,
  sourceChain,
  destinationChain,
  maxSlippagePercent,
}) => {
  const { slippage, exceeded, threshold } = useSlippageAlert({
    token,
    sourceChain,
    destinationChain,
    maxSlippagePercent,
  });

  return (
    <div>
      <h2>Bridge Comparison</h2>
      <p>Token: {token}</p>
      <p>Source Chain: {sourceChain}</p>
      <p>Destination Chain: {destinationChain}</p>
      <p>Current Slippage: {slippage}%</p>
      <p>Threshold: {threshold}%</p>
      {exceeded && <p style={{ color: "red" }}>Warning: Slippage exceeds threshold!</p>}
    </div>
  );
};

export default BridgeCompare;