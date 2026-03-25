"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowMode = exports.ReliabilityTier = exports.TransactionOutcome = void 0;
var TransactionOutcome;
(function (TransactionOutcome) {
    TransactionOutcome["SUCCESS"] = "SUCCESS";
    TransactionOutcome["FAILED"] = "FAILED";
    TransactionOutcome["TIMEOUT"] = "TIMEOUT";
    TransactionOutcome["CANCELLED"] = "CANCELLED";
})(TransactionOutcome || (exports.TransactionOutcome = TransactionOutcome = {}));
var ReliabilityTier;
(function (ReliabilityTier) {
    ReliabilityTier["HIGH"] = "HIGH";
    ReliabilityTier["MEDIUM"] = "MEDIUM";
    ReliabilityTier["LOW"] = "LOW";
})(ReliabilityTier || (exports.ReliabilityTier = ReliabilityTier = {}));
var WindowMode;
(function (WindowMode) {
    WindowMode["TRANSACTION_COUNT"] = "TRANSACTION_COUNT";
    WindowMode["TIME_BASED"] = "TIME_BASED";
})(WindowMode || (exports.WindowMode = WindowMode = {}));
//# sourceMappingURL=reliability.enum.js.map