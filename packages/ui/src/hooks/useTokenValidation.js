"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTokenValidation = useTokenValidation;
const react_1 = require("react");
const tokenValidation_1 = require("./tokenValidation");
function useTokenValidation(symbol, sourceChain, destinationChain) {
    // SSR-safe: no window/document usage
    const result = (0, react_1.useMemo)(() => (0, tokenValidation_1.isTokenSupported)(symbol, sourceChain, destinationChain), [symbol, sourceChain, destinationChain]);
    return result;
}
//# sourceMappingURL=useTokenValidation.js.map