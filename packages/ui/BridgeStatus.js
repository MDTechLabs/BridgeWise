"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const useSlippageAlert_1 = require("../bridge-core/useSlippageAlert");
const BridgeStatus = ({ token, sourceChain, destinationChain, maxSlippagePercent, }) => {
    const { slippage, exceeded, errors } = (0, useSlippageAlert_1.useSlippageAlert)({
        token,
        sourceChain,
        destinationChain,
        maxSlippagePercent,
    });
    return (<div>
      <h2>Bridge Status</h2>
      <p>Current Slippage: {slippage}%</p>
      {exceeded && (<p style={{ color: "red" }}>
          Slippage exceeds safe threshold!
        </p>)}
      {errors.length > 0 && (<ul>
          {errors.map((error, index) => (<li key={index} style={{ color: "red" }}>
              {error}
            </li>))}
        </ul>)}
    </div>);
};
exports.default = BridgeStatus;
//# sourceMappingURL=BridgeStatus.js.map