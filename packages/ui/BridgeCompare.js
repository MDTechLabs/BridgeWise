"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const useSlippageAlert_1 = require("../bridge-core/useSlippageAlert");
const BridgeCompare = ({ token, sourceChain, destinationChain, maxSlippagePercent, }) => {
    const { slippage, exceeded, threshold } = (0, useSlippageAlert_1.useSlippageAlert)({
        token,
        sourceChain,
        destinationChain,
        maxSlippagePercent,
    });
    return (<div>
      <h2>Bridge Comparison</h2>
      <p>Token: {token}</p>
      <p>Source Chain: {sourceChain}</p>
      <p>Destination Chain: {destinationChain}</p>
      <p>Current Slippage: {slippage}%</p>
      <p>Threshold: {threshold}%</p>
      {exceeded && <p style={{ color: "red" }}>Warning: Slippage exceeds threshold!</p>}
    </div>);
};
exports.default = BridgeCompare;
//# sourceMappingURL=BridgeCompare.js.map