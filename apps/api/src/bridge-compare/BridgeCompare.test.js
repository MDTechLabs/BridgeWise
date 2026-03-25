"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_2 = require("@testing-library/react");
const BridgeCompare_1 = require("./BridgeCompare");
// ─── Mock fetch ────────────────────────────────────────────────────────────────
const mockQuote = (override = {}) => ({
    bridgeId: 'stargate',
    bridgeName: 'Stargate Finance',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    sourceToken: 'USDC',
    destinationToken: 'USDC',
    inputAmount: 100,
    outputAmount: 98.5,
    totalFeeUsd: 1.20,
    estimatedTimeSeconds: 45,
    slippagePercent: 0.05,
    reliabilityScore: 96,
    compositeScore: 87.4,
    rankingPosition: 1,
    bridgeStatus: 'active',
    metadata: {},
    fetchedAt: new Date().toISOString(),
    ...override,
});
const mockResponse = (overrides = {}) => ({
    quotes: [
        mockQuote({ bridgeId: 'stargate', bridgeName: 'Stargate Finance', rankingPosition: 1, compositeScore: 87 }),
        mockQuote({ bridgeId: 'squid', bridgeName: 'Squid Router', rankingPosition: 2, compositeScore: 82, totalFeeUsd: 1.60 }),
        mockQuote({ bridgeId: 'hop', bridgeName: 'Hop Protocol', rankingPosition: 3, compositeScore: 78, totalFeeUsd: 2.10 }),
    ],
    bestRoute: mockQuote({ bridgeId: 'stargate', rankingPosition: 1 }),
    rankingMode: 'balanced',
    successfulProviders: 3,
    totalProviders: 4,
    fetchDurationMs: 143,
    ...overrides,
});
function mockFetchSuccess(response = mockResponse()) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => response,
    });
}
function mockFetchError(message = 'No routes found') {
    global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message }),
    });
}
function mockFetchNetworkFailure() {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
}
const defaultProps = {
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    sourceToken: 'USDC',
    amount: 100,
};
// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('BridgeCompare', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    // ─── Rendering ──────────────────────────────────────────────────────────────
    describe('initial render', () => {
        it('renders root element', () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            expect(react_2.screen.getByTestId('bridge-compare-root')).toBeInTheDocument();
        });
        it('shows loading state while fetching', async () => {
            global.fetch = jest.fn().mockReturnValue(new Promise(() => { })); // never resolves
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            expect(react_2.screen.getByTestId('loading-state')).toBeInTheDocument();
        });
        it('shows bridge route header with chain and token info', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            expect(react_2.screen.getByText(/stellar/i)).toBeInTheDocument();
            expect(react_2.screen.getByText(/ethereum/i)).toBeInTheDocument();
        });
        it('shows ranking mode tabs', () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            expect(react_2.screen.getByTestId('ranking-tab-balanced')).toBeInTheDocument();
            expect(react_2.screen.getByTestId('ranking-tab-lowest-cost')).toBeInTheDocument();
            expect(react_2.screen.getByTestId('ranking-tab-fastest')).toBeInTheDocument();
        });
    });
    // ─── Successful quote display ────────────────────────────────────────────────
    describe('quote display', () => {
        it('renders all quotes after fetch', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => {
                expect(react_2.screen.getByTestId('quotes-list')).toBeInTheDocument();
            });
            expect(react_2.screen.getByTestId('quote-card-stargate')).toBeInTheDocument();
            expect(react_2.screen.getByTestId('quote-card-squid')).toBeInTheDocument();
            expect(react_2.screen.getByTestId('quote-card-hop')).toBeInTheDocument();
        });
        it('displays fee, speed, slippage, reliability for each quote', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getAllByText(/Total Fee/i).length).toBeGreaterThan(0);
            expect(react_2.screen.getAllByText(/Speed/i).length).toBeGreaterThan(0);
            expect(react_2.screen.getAllByText(/Slippage/i).length).toBeGreaterThan(0);
            expect(react_2.screen.getAllByText(/Reliability/i).length).toBeGreaterThan(0);
        });
        it('displays reliability badge for each quote', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getByTestId('reliability-badge-stargate')).toBeInTheDocument();
        });
        it('shows ★ Best Route badge on best route', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getByText(/Best Route/i)).toBeInTheDocument();
        });
        it('shows sort indicator label', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getByText(/Sorted by/i)).toBeInTheDocument();
        });
        it('shows provider count in summary', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getByText(/3\/4 providers/i)).toBeInTheDocument();
        });
    });
    // ─── Route selection ─────────────────────────────────────────────────────────
    describe('route selection', () => {
        it('calls onRouteSelect with correct route when clicking select button', async () => {
            const onRouteSelect = jest.fn();
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} onRouteSelect={onRouteSelect}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const selectBtn = react_2.screen.getAllByRole('button', { name: /Select Route/i })[0];
            react_2.fireEvent.click(selectBtn);
            expect(onRouteSelect).toHaveBeenCalledTimes(1);
            expect(onRouteSelect).toHaveBeenCalledWith(expect.objectContaining({ bridgeId: 'stargate' }));
        });
        it('calls onRouteSelect with full NormalizedQuote object', async () => {
            const onRouteSelect = jest.fn();
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} onRouteSelect={onRouteSelect}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            react_2.fireEvent.click(react_2.screen.getAllByRole('button', { name: /Select Route/i })[0]);
            const received = onRouteSelect.mock.calls[0][0];
            expect(received.bridgeId).toBeDefined();
            expect(received.totalFeeUsd).toBeDefined();
            expect(received.estimatedTimeSeconds).toBeDefined();
            expect(received.slippagePercent).toBeDefined();
            expect(received.reliabilityScore).toBeDefined();
            expect(received.compositeScore).toBeDefined();
        });
        it('shows ✓ Selected on selected card button', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            react_2.fireEvent.click(react_2.screen.getAllByRole('button', { name: /Select Route/i })[0]);
            expect(react_2.screen.getByText('✓ Selected')).toBeInTheDocument();
        });
        it('supports keyboard Enter to select a route', async () => {
            const onRouteSelect = jest.fn();
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} onRouteSelect={onRouteSelect}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const card = react_2.screen.getByTestId('quote-card-stargate');
            react_2.fireEvent.keyDown(card, { key: 'Enter' });
            expect(onRouteSelect).toHaveBeenCalledTimes(1);
        });
        it('does not call onRouteSelect when onRouteSelect is not provided', async () => {
            mockFetchSuccess();
            // Should not throw
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(() => react_2.fireEvent.click(react_2.screen.getAllByRole('button', { name: /Select Route/i })[0])).not.toThrow();
        });
    });
    // ─── Ranking mode ────────────────────────────────────────────────────────────
    describe('ranking mode', () => {
        it('defaults to balanced mode', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const tab = react_2.screen.getByTestId('ranking-tab-balanced');
            expect(tab.style.background).not.toBe('transparent');
        });
        it('re-fetches quotes when ranking mode tab changes', async () => {
            mockFetchSuccess();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const fetchCallsBefore = global.fetch.mock.calls.length;
            react_2.fireEvent.click(react_2.screen.getByTestId('ranking-tab-fastest'));
            await (0, react_2.waitFor)(() => {
                expect(global.fetch.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
            });
            const lastCall = global.fetch.mock.calls.at(-1)?.[0];
            expect(lastCall).toContain('rankingMode=fastest');
        });
        it('updates when external rankingMode prop changes', async () => {
            mockFetchSuccess();
            const { rerender } = (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} rankingMode="balanced"/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            mockFetchSuccess(mockResponse({ rankingMode: 'lowest-cost' }));
            rerender(<BridgeCompare_1.BridgeCompare {...defaultProps} rankingMode="lowest-cost"/>);
            await (0, react_2.waitFor)(() => {
                const lastUrl = global.fetch.mock.calls.at(-1)?.[0];
                expect(lastUrl).toContain('rankingMode=lowest-cost');
            });
        });
    });
    // ─── Prop change re-renders ───────────────────────────────────────────────────
    describe('prop changes', () => {
        it('re-fetches on amount change', async () => {
            mockFetchSuccess();
            const { rerender } = (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} amount={100}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const countBefore = global.fetch.mock.calls.length;
            rerender(<BridgeCompare_1.BridgeCompare {...defaultProps} amount={500}/>);
            await (0, react_2.waitFor)(() => {
                expect(global.fetch.mock.calls.length).toBeGreaterThan(countBefore);
            });
            const lastUrl = global.fetch.mock.calls.at(-1)?.[0];
            expect(lastUrl).toContain('amount=500');
        });
        it('re-fetches on sourceChain change', async () => {
            mockFetchSuccess();
            const { rerender } = (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            const countBefore = global.fetch.mock.calls.length;
            rerender(<BridgeCompare_1.BridgeCompare {...defaultProps} sourceChain="polygon"/>);
            await (0, react_2.waitFor)(() => {
                expect(global.fetch.mock.calls.length).toBeGreaterThan(countBefore);
            });
        });
    });
    // ─── Error states ─────────────────────────────────────────────────────────────
    describe('error handling', () => {
        it('shows error state on failed fetch', async () => {
            mockFetchError('No routes found for this token pair');
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('error-state'));
            expect(react_2.screen.getByText(/No routes found/i)).toBeInTheDocument();
        });
        it('shows retry button in error state', async () => {
            mockFetchError();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('retry-button'));
            expect(react_2.screen.getByTestId('retry-button')).toBeInTheDocument();
        });
        it('retries fetch when retry button clicked', async () => {
            mockFetchError();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('retry-button'));
            mockFetchSuccess();
            react_2.fireEvent.click(react_2.screen.getByTestId('retry-button'));
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('quotes-list'));
            expect(react_2.screen.getByTestId('quotes-list')).toBeInTheDocument();
        });
        it('calls onError callback with Error object', async () => {
            const onError = jest.fn();
            mockFetchNetworkFailure();
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} onError={onError}/>);
            await (0, react_2.waitFor)(() => {
                expect(onError).toHaveBeenCalledWith(expect.any(Error));
            });
        });
        it('renders custom error component when provided', async () => {
            mockFetchError('Bridge API failure');
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} errorComponent={(err, retry) => (<div data-testid="custom-error">
              Custom: {err.message}
              <button onClick={retry}>Try again</button>
            </div>)}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('custom-error'));
            expect(react_2.screen.getByText(/Custom:/i)).toBeInTheDocument();
        });
    });
    // ─── Unsupported pair ─────────────────────────────────────────────────────────
    describe('unsupported token pair', () => {
        it('shows error for unsupported pair', async () => {
            mockFetchError('No bridge providers support this route');
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare sourceChain="stellar" destinationChain="ethereum" sourceToken="FAKE_TOKEN" amount={100}/>);
            await (0, react_2.waitFor)(() => react_2.screen.getByTestId('error-state'));
            expect(react_2.screen.getByText(/No bridge providers/i)).toBeInTheDocument();
        });
    });
    // ─── Custom loading component ─────────────────────────────────────────────────
    describe('custom components', () => {
        it('renders custom loading component', () => {
            global.fetch = jest.fn().mockReturnValue(new Promise(() => { }));
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} loadingComponent={<div data-testid="custom-loader">Loading bridges…</div>}/>);
            expect(react_2.screen.getByTestId('custom-loader')).toBeInTheDocument();
        });
    });
    // ─── onQuotesLoaded callback ──────────────────────────────────────────────────
    describe('onQuotesLoaded callback', () => {
        it('calls onQuotesLoaded with full QuoteResponse', async () => {
            const onQuotesLoaded = jest.fn();
            const response = mockResponse();
            mockFetchSuccess(response);
            (0, react_2.render)(<BridgeCompare_1.BridgeCompare {...defaultProps} onQuotesLoaded={onQuotesLoaded}/>);
            await (0, react_2.waitFor)(() => {
                expect(onQuotesLoaded).toHaveBeenCalledWith(expect.objectContaining({
                    quotes: expect.any(Array),
                    bestRoute: expect.any(Object),
                    rankingMode: 'balanced',
                }));
            });
        });
    });
});
//# sourceMappingURL=BridgeCompare.test.js.map