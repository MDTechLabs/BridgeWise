"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportedChain = exports.BridgeStatus = exports.RankingMode = void 0;
var RankingMode;
(function (RankingMode) {
    RankingMode["BALANCED"] = "balanced";
    RankingMode["LOWEST_COST"] = "lowest-cost";
    RankingMode["FASTEST"] = "fastest";
})(RankingMode || (exports.RankingMode = RankingMode = {}));
var BridgeStatus;
(function (BridgeStatus) {
    BridgeStatus["ACTIVE"] = "active";
    BridgeStatus["DEGRADED"] = "degraded";
    BridgeStatus["OFFLINE"] = "offline";
})(BridgeStatus || (exports.BridgeStatus = BridgeStatus = {}));
var SupportedChain;
(function (SupportedChain) {
    SupportedChain["STELLAR"] = "stellar";
    SupportedChain["ETHEREUM"] = "ethereum";
    SupportedChain["POLYGON"] = "polygon";
    SupportedChain["BINANCE"] = "binance";
    SupportedChain["AVALANCHE"] = "avalanche";
    SupportedChain["ARBITRUM"] = "arbitrum";
    SupportedChain["OPTIMISM"] = "optimism";
})(SupportedChain || (exports.SupportedChain = SupportedChain = {}));
//# sourceMappingURL=index.js.map