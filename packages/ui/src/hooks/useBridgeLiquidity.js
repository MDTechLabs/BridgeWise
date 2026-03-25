'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchBridgeLiquiditySnapshot = fetchBridgeLiquiditySnapshot;
exports.useBridgeLiquidity = useBridgeLiquidity;
const react_1 = require("react");
const monitor_1 = require("../liquidity/monitor");
async function fetchBridgeLiquiditySnapshot(monitor, query) {
    return monitor.getLiquidity(query);
}
function useBridgeLiquidity(options) {
    const [liquidity, setLiquidity] = (0, react_1.useState)([]);
    const [errors, setErrors] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [usedFallback, setUsedFallback] = (0, react_1.useState)(false);
    const monitor = (0, react_1.useMemo)(() => new monitor_1.BridgeLiquidityMonitor(options.config), [options.config]);
    const refreshLiquidity = (0, react_1.useCallback)(async () => {
        if (typeof window === 'undefined') {
            setLiquidity([]);
            setErrors([]);
            setUsedFallback(false);
            return;
        }
        setLoading(true);
        try {
            const result = await fetchBridgeLiquiditySnapshot(monitor, {
                token: options.token,
                sourceChain: options.sourceChain,
                destinationChain: options.destinationChain,
                bridgeName: options.bridgeName,
            });
            setLiquidity(result.liquidity);
            setErrors(result.errors);
            setUsedFallback(result.usedFallback);
        }
        finally {
            setLoading(false);
        }
    }, [monitor, options.bridgeName, options.destinationChain, options.sourceChain, options.token]);
    (0, react_1.useEffect)(() => {
        void refreshLiquidity();
    }, [refreshLiquidity]);
    (0, react_1.useEffect)(() => {
        if (!options.refreshIntervalMs || options.refreshIntervalMs <= 0) {
            return;
        }
        const interval = window.setInterval(() => {
            void refreshLiquidity();
        }, options.refreshIntervalMs);
        return () => {
            window.clearInterval(interval);
        };
    }, [options.refreshIntervalMs, refreshLiquidity]);
    return {
        liquidity,
        loading,
        errors,
        usedFallback,
        refreshLiquidity,
    };
}
//# sourceMappingURL=useBridgeLiquidity.js.map