"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSlippageThreshold = void 0;
const slippageConfig = {
    USDC: 0.5,
    ETH: 1.0,
    STX: 0.8,
};
const getSlippageThreshold = (token) => {
    return slippageConfig[token] || 1.0; // Default to 1.0% if token not configured
};
exports.getSlippageThreshold = getSlippageThreshold;
//# sourceMappingURL=config.js.map