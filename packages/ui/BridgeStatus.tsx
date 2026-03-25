import React from "react";
import { useSlippageAlert } from "../bridge-core/useSlippageAlert";

interface BridgeStatusProps {
  token: string;
  sourceChain: string;
  destinationChain: string;
  maxSlippagePercent: number;
}

const BridgeStatus: React.FC<BridgeStatusProps> = ({
  token,
  sourceChain,
  destinationChain,
  maxSlippagePercent,
}) => {
  const { slippage, exceeded, errors } = useSlippageAlert({
    token,
    sourceChain,
    destinationChain,
    maxSlippagePercent,
  });

  return (
    <div>
      <h2>Bridge Status</h2>
      <p>Current Slippage: {slippage}%</p>
      {exceeded && (
        <p style={{ color: "red" }}>
          Slippage exceeds safe threshold!
        </p>
      )}
      {errors.length > 0 && (
        <ul>
          {errors.map((error, index) => (
            <li key={index} style={{ color: "red" }}>
              {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BridgeStatus;