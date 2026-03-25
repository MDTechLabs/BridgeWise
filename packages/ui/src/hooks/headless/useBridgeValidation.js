"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBridgeValidation = useBridgeValidation;
const react_1 = require("react");
const tokenValidation_1 = require("../../tokenValidation");
function useBridgeValidation(token, sourceChain, destinationChain) {
    return (0, react_1.useMemo)(() => (0, tokenValidation_1.isTokenSupported)(token, sourceChain, destinationChain), [token, sourceChain, destinationChain]);
}
//# sourceMappingURL=useBridgeValidation.js.map