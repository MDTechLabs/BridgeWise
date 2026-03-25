"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HopService = void 0;
const common_1 = require("@nestjs/common");
/**
 * STEP 1: Understanding the Hop Service
 * =====================================
 *
 * This service is the "brain" of our Hop Protocol integration. Think of it like a translator
 * that takes data from Hop's API (which has its own format) and converts it into a format
 * that our BridgeWise application understands.
 *
 * Why do we need this?
 * - Different bridge protocols return data in different formats
 * - We want a consistent format across our entire app
 * - This makes it easier to compare routes from different bridges
 *
 * What does this service do?
 * 1. Normalizes routes (converts Hop format → BridgeRoute format)
 * 2. Normalizes fees (breaks down Hop's fees into our standard structure)
 * 3. Provides fallback data when Hop API is down
 */
let HopService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var HopService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(HopService.name);
            /**
             * STEP 2: Understanding the Cache
             * ================================
             *
             * A cache is like a temporary storage box. When we get data from Hop API,
             * we save a copy here. If Hop API goes down, we can use this saved copy.
             *
             * Why use a cache?
             * - API calls are slow (network requests take time)
             * - APIs can fail or be temporarily unavailable
             * - Cached data = instant response
             *
             * The Map structure:
             * - Key: A unique identifier (like "ethereum-polygon-USDC")
             * - Value: The cached quote data with a timestamp
             */
            this.quoteCache = new Map();
            // Cache duration: 5 minutes (5 * 60 * 1000 milliseconds)
            this.CACHE_TTL = 5 * 60 * 1000;
        }
        /**
         * STEP 3: Route Normalization - The Main Function
         * ================================================
         *
         * This is where the magic happens! We take Hop's raw data and transform it
         * into our standard BridgeRoute format.
         *
         * Think of it like translating from Spanish to English:
         * - Hop speaks "Spanish" (their API format)
         * - Our app speaks "English" (BridgeRoute format)
         * - This function is the translator
         *
         * @param rawRoute - The data we got from Hop API (in their format)
         * @param request - The original request (what the user asked for)
         * @returns A normalized BridgeRoute that our app understands
         */
        normalizeRoute(rawRoute, request) {
            this.logger.debug('Normalizing Hop route', { rawRoute, request });
            /**
             * STEP 3.1: Extract the Important Data
             * ====================================
             *
             * Hop API gives us several numbers:
             * - amountOutMin: The minimum you'll receive (worst case)
             * - estimatedReceived: What you'll probably receive (best estimate)
             * - bonderFee: Fee paid to the "bonder" (person who helps bridge)
             * - lpFee: Fee paid to liquidity providers
             * - destinationTxFee: Gas fee on the destination chain
             *
             * We use the "??" operator (nullish coalescing):
             * - If the value exists, use it
             * - If it's null/undefined, use the fallback (after ??)
             */
            const estimatedReceived = rawRoute.estimatedReceived ?? rawRoute.amountOutMin ?? '0';
            const bonderFee = rawRoute.bonderFee ?? '0';
            const lpFee = rawRoute.lpFee ?? '0';
            const destinationTxFee = rawRoute.destinationTxFee ?? '0';
            const amountOutMin = rawRoute.amountOutMin ?? estimatedReceived;
            /**
             * STEP 3.2: Calculate Total Fees
             * ===============================
             *
             * BigInt is JavaScript's way of handling very large numbers.
             * In blockchain, we deal with tiny fractions (like 0.000001 ETH)
             * which are represented as huge integers (1000000000000 wei).
             *
             * Why BigInt?
             * - Regular JavaScript numbers lose precision with big values
             * - BigInt can handle numbers of any size accurately
             * - We use 'n' suffix to create BigInt literals
             *
             * Total fee = bonder fee + LP fee + destination tx fee
             */
            const totalFee = (BigInt(bonderFee) +
                BigInt(lpFee) +
                BigInt(destinationTxFee)).toString();
            /**
             * STEP 3.3: Calculate Fee Percentage
             * ===================================
             *
             * Users want to know: "What percentage of my money goes to fees?"
             *
             * Formula: (fee / inputAmount) * 100
             *
             * Example:
             * - Input: 1000 USDC
             * - Fee: 5 USDC
             * - Percentage: (5 / 1000) * 100 = 0.5%
             */
            const feePercentage = this.calculateFeePercentage(request.assetAmount, estimatedReceived);
            /**
             * STEP 3.4: Build the Normalized Route Object
             * ===========================================
             *
             * This is our final output - a BridgeRoute object that follows
             * our application's standard format.
             *
             * Each field has a specific purpose:
             * - id: Unique identifier for this route
             * - provider: Which bridge (always 'hop' for this service)
             * - sourceChain/targetChain: Where we're bridging from/to
             * - inputAmount: How much the user is sending
             * - outputAmount: How much they'll receive
             * - fee: Total fees charged
             * - feePercentage: Fees as a percentage
             * - estimatedTime: How long the bridge will take
             * - minAmountOut: Minimum guaranteed output (slippage protection)
             * - maxAmountOut: Maximum possible output
             * - reliability: How reliable this route is (0-1 scale)
             * - metadata: Extra information (fee breakdown, description, etc.)
             */
            const normalizedRoute = {
                id: this.generateRouteId(request),
                provider: 'hop',
                sourceChain: request.sourceChain,
                targetChain: request.targetChain,
                inputAmount: request.assetAmount,
                outputAmount: estimatedReceived,
                fee: totalFee,
                feePercentage,
                estimatedTime: this.estimateBridgeTime(request.sourceChain, request.targetChain),
                reliability: 0.85, // Hop has good reliability (85%)
                minAmountOut: amountOutMin,
                maxAmountOut: estimatedReceived,
                deadline: rawRoute.deadline ? parseInt(rawRoute.deadline) : undefined,
                transactionData: {
                    gasEstimate: rawRoute.gasEstimate,
                },
                metadata: {
                    description: `Bridge via Hop Protocol from ${request.sourceChain} to ${request.targetChain}`,
                    riskLevel: 2, // Low-medium risk (1=lowest, 5=highest)
                    feeBreakdown: {
                        networkFee: destinationTxFee,
                        bridgeFee: lpFee,
                        slippageFee: bonderFee,
                    },
                    bonderFee,
                    lpFee,
                    destinationTxFee,
                    estimatedReceived,
                },
            };
            this.logger.debug('Route normalized successfully', { normalizedRoute });
            return normalizedRoute;
        }
        /**
         * STEP 4: Fee Normalization
         * ==========================
         *
         * This function takes Hop's fee response and converts it to our
         * standard HopFeeResponse format.
         *
         * Why normalize fees separately?
         * - Sometimes we only need fee info, not full route data
         * - Keeps our code modular (each function does one thing)
         * - Makes testing easier
         *
         * @param rawFees - Raw fee data from Hop API
         * @returns Normalized HopFeeResponse
         */
        normalizeFees(rawFees) {
            return {
                lpFee: rawFees.lpFee ?? rawFees.totalFee ?? '1000',
                bonderFee: rawFees.bonderFee ?? '500',
                destinationTxFee: rawFees.destinationTxFee ?? rawFees.relayerFee ?? '2000',
                decimals: rawFees.decimals ?? 18,
                symbol: rawFees.symbol ?? 'ETH',
                token: rawFees.token ?? 'native',
                sourceChain: rawFees.sourceChain ?? 'ethereum',
                destinationChain: rawFees.destinationChain ?? 'polygon',
                estimatedReceived: rawFees.estimatedReceived,
                amountOutMin: rawFees.amountOutMin,
                gasEstimate: rawFees.gasEstimate,
                deadline: rawFees.deadline,
            };
        }
        /**
         * STEP 5: Cache Management - Storing Quotes
         * ==========================================
         *
         * When we get a quote from Hop API, we save it here for later use.
         *
         * The cache key is like a filing system:
         * - "ethereum-polygon-USDC" → Quote for bridging USDC from Ethereum to Polygon
         * - "arbitrum-optimism-ETH" → Quote for bridging ETH from Arbitrum to Optimism
         *
         * @param request - The route request (used to generate the key)
         * @param quote - The quote to cache
         */
        setCachedQuote(request, quote) {
            const key = this.generateCacheKey(request);
            this.quoteCache.set(key, {
                quote,
                timestamp: Date.now(), // Current time in milliseconds
                ttl: this.CACHE_TTL, // How long this cache is valid
            });
            this.logger.debug(`Cached quote for ${key}`, { quote });
        }
        /**
         * STEP 6: Cache Management - Retrieving Quotes
         * =============================================
         *
         * Try to get a cached quote. If it exists and isn't too old, return it.
         *
         * Cache validation:
         * 1. Does the cache entry exist?
         * 2. Is it still fresh (not expired)?
         *
         * @param request - The route request
         * @returns Cached quote if valid, null otherwise
         */
        getCachedQuote(request) {
            const key = this.generateCacheKey(request);
            const cached = this.quoteCache.get(key);
            // No cache entry found
            if (!cached) {
                this.logger.debug(`No cache found for ${key}`);
                return null;
            }
            // Check if cache is still fresh
            const age = Date.now() - cached.timestamp;
            const isExpired = age > cached.ttl;
            if (isExpired) {
                this.logger.debug(`Cache expired for ${key}`, { age, ttl: cached.ttl });
                this.quoteCache.delete(key); // Clean up expired cache
                return null;
            }
            this.logger.debug(`Cache hit for ${key}`, { age });
            return cached.quote;
        }
        /**
         * STEP 7: Fallback Fees - The Safety Net
         * =======================================
         *
         * When everything fails (API down, cache empty), we need a backup plan.
         * These are conservative estimates based on historical Hop Protocol data.
         *
         * Why use fallback fees?
         * - Better to show estimated fees than no fees at all
         * - Keeps the user experience smooth
         * - Prevents the entire app from breaking
         *
         * The fees are calculated as percentages of the token amount:
         * - LP Fee: 0.04% (4 basis points)
         * - Bonder Fee: 0.02% (2 basis points)
         * - Destination Tx Fee: 0.1% (10 basis points)
         *
         * @param token - Token symbol (USDC, ETH, etc.)
         * @param sourceChain - Source chain
         * @param destinationChain - Destination chain
         * @returns Conservative fallback fees
         */
        getFallbackFees(token, sourceChain, destinationChain) {
            const decimals = this.getDecimalsForToken(token);
            const baseAmount = Math.pow(10, decimals); // 1 token in smallest unit
            this.logger.warn('Using fallback fees for Hop', {
                token,
                sourceChain,
                destinationChain,
            });
            return {
                lpFee: Math.floor(baseAmount * 0.0004).toString(), // 0.04%
                bonderFee: Math.floor(baseAmount * 0.0002).toString(), // 0.02%
                destinationTxFee: Math.floor(baseAmount * 0.001).toString(), // 0.1%
                decimals,
                symbol: token,
                token,
                sourceChain,
                destinationChain,
            };
        }
        /**
         * STEP 8: Helper Functions
         * =========================
         *
         * These are small utility functions that help the main functions work.
         * Think of them as tools in a toolbox.
         */
        /**
         * Calculate what percentage of the input amount is lost to fees
         *
         * Formula: ((input - output) / input) * 100
         */
        calculateFeePercentage(inputAmount, outputAmount) {
            try {
                const input = BigInt(inputAmount);
                const output = BigInt(outputAmount);
                if (input === 0n)
                    return 0;
                const fee = input - output;
                // Multiply by 10000 for precision, then divide by 100 to get percentage
                const feePercentage = Number((fee * 10000n) / input) / 100;
                // Clamp between 0 and 100
                return Math.max(0, Math.min(100, feePercentage));
            }
            catch (error) {
                this.logger.error('Error calculating fee percentage', error);
                return 0;
            }
        }
        /**
         * Estimate how long the bridge will take based on the chain pair
         *
         * L1 (Ethereum) → L2 (Polygon, Arbitrum, etc.): Slower (10-20 min)
         * L2 → L2: Faster (2-5 min)
         *
         * Returns time in seconds
         */
        estimateBridgeTime(sourceChain, targetChain) {
            const isL1Source = sourceChain === 'ethereum';
            const isL2Source = [
                'polygon',
                'arbitrum',
                'optimism',
                'base',
                'gnosis',
                'nova',
            ].includes(sourceChain);
            if (isL1Source) {
                return 15 * 60; // 15 minutes
            }
            else if (isL2Source) {
                return 3 * 60; // 3 minutes
            }
            return 5 * 60; // Default: 5 minutes
        }
        /**
         * Get the number of decimal places for a token
         *
         * Why do we need this?
         * - Different tokens have different decimal places
         * - USDC has 6 decimals (1 USDC = 1,000,000 smallest units)
         * - ETH has 18 decimals (1 ETH = 1,000,000,000,000,000,000 wei)
         */
        getDecimalsForToken(token) {
            const decimals = {
                USDC: 6,
                USDT: 6,
                DAI: 18,
                ETH: 18,
                MATIC: 18,
                WETH: 18,
            };
            return decimals[token.toUpperCase()] || 18; // Default to 18 if unknown
        }
        /**
         * Generate a unique ID for a route
         *
         * Format: "hop-ethereum-polygon-1234567890"
         * This helps us track and identify specific routes
         */
        generateRouteId(request) {
            return `hop-${request.sourceChain}-${request.targetChain}-${Date.now()}`;
        }
        /**
         * Generate a cache key from a route request
         *
         * Format: "ethereum-polygon-USDC"
         * This is used to store and retrieve cached quotes
         */
        generateCacheKey(request) {
            const token = request.tokenAddress || 'native';
            return `${request.sourceChain}-${request.targetChain}-${token}`;
        }
    };
    __setFunctionName(_classThis, "HopService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HopService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HopService = _classThis;
})();
exports.HopService = HopService;
//# sourceMappingURL=hop.service.js.map