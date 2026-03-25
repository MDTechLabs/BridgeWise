"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBridgeQuotes = useBridgeQuotes;
const react_1 = require("react");
const tokenValidation_1 = require("../../tokenValidation");
function useBridgeQuotes(options = {}) {
    const { initialParams, debounceMs = 300, config = {}, } = options;
    const autoRefresh = config?.autoRefreshQuotes ?? true;
    const [params, setParams] = (0, react_1.useState)(initialParams);
    const [quotes, setQuotes] = (0, react_1.useState)([]); // NormalizedQuote[]
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [lastRefreshed, setLastRefreshed] = (0, react_1.useState)(null);
    const [isRefreshing, setIsRefreshing] = (0, react_1.useState)(false);
    const [retryCount, setRetryCount] = (0, react_1.useState)(0);
    const engineRef = (0, react_1.useRef)(null); // QuoteRefreshEngine | null
    const debounceTimerRef = (0, react_1.useRef)();
    const paramsRef = (0, react_1.useRef)(params);
    (0, react_1.useEffect)(() => {
        paramsRef.current = params;
    }, [params]);
    (0, react_1.useEffect)(() => {
        const fetchQuotes = async (fetchParams, options) => {
            const validation = (0, tokenValidation_1.isTokenSupported)(fetchParams.sourceToken, fetchParams.sourceChain, fetchParams.destinationChain);
            if (!validation.isValid) {
                const error = new Error(validation.errors.join('; '));
                setError(error);
                throw error;
            }
            // Replace with actual fetch logic
            return [];
        };
        engineRef.current = new QuoteRefreshEngine(fetchQuotes, {
            // ...config
            onRefresh: (newQuotes) => {
                setQuotes(newQuotes);
                setLastRefreshed(new Date());
            },
            onError: (err) => {
                setError(err);
            },
            onRefreshStart: () => setIsRefreshing(true),
            onRefreshEnd: () => setIsRefreshing(false),
        });
        // Listen to state changes
        const handleStateChange = (state) => {
            setRetryCount(state.retryCount);
            setIsLoading(state.isRefreshing);
        };
        engineRef.current.on('state-change', handleStateChange);
        if (params) {
            engineRef.current.initialize(params);
        }
        return () => {
            if (engineRef.current) {
                engineRef.current.destroy();
            }
        };
    }, []);
    const updateParams = (0, react_1.useCallback)((newParams) => {
        if (!paramsRef.current)
            return;
        const updatedParams = { ...paramsRef.current, ...newParams };
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            setParams(updatedParams);
            if (engineRef.current) {
                engineRef.current.refresh({
                    type: 'parameter-change',
                    timestamp: Date.now(),
                    params: updatedParams
                }).catch((err) => {
                    console.error('Failed to refresh quotes after parameter change:', err);
                });
            }
        }, debounceMs);
    }, [debounceMs]);
    const refresh = (0, react_1.useCallback)(async () => {
        if (!engineRef.current) {
            throw new Error('Refresh engine not initialized');
        }
        try {
            setIsLoading(true);
            setError(null);
            const newQuotes = await engineRef.current.refresh({
                type: 'manual',
                timestamp: Date.now()
            });
            return newQuotes;
        }
        catch (err) {
            setError(err);
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return {
        quotes,
        isLoading,
        error,
        lastRefreshed,
        isRefreshing,
        refresh,
        updateParams,
        retryCount
    };
}
//# sourceMappingURL=useBridgeQuotes.js.map