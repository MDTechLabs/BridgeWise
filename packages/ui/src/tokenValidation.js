"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTokenSupported = isTokenSupported;
const tokenRegistry_1 = require("./tokenRegistry");
function isTokenSupported(symbol, sourceChain, destinationChain) {
    const token = tokenRegistry_1.TOKEN_REGISTRY.find((t) => t.symbol === symbol && t.chain.toLowerCase() === sourceChain.toLowerCase());
    if (!token) {
        return {
            isValid: false,
            errors: [`Token ${symbol} not found on source chain ${sourceChain}`],
        };
    }
    if (!token.bridgeSupported.map((c) => c.toLowerCase()).includes(destinationChain.toLowerCase())) {
        return {
            isValid: false,
            errors: [`Token ${symbol} is not supported for bridging from ${sourceChain} to ${destinationChain}`],
            tokenInfo: token,
        };
    }
    return { isValid: true, errors: [], tokenInfo: token };
}
//# sourceMappingURL=tokenValidation.js.map