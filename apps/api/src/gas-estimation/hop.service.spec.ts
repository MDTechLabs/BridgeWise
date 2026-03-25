import { Test, TestingModule } from '@nestjs/testing';
import { HopService } from './hop.service';
import { RouteRequest, BridgeRoute } from '@bridgewise/bridge-core';

/**
 * STEP 16: Understanding Unit Tests
 * ==================================
 *
 * Unit tests are like quality control checks in a factory.
 * Each test checks one specific piece of functionality.
 *
 * Why write tests?
 * 1. Catch bugs before users do
 * 2. Ensure code works as expected
 * 3. Prevent regressions (breaking things that used to work)
 * 4. Document how the code should behave
 * 5. Make refactoring safer
 *
 * Test Structure (AAA Pattern):
 * - Arrange: Set up the test data
 * - Act: Call the function being tested
 * - Assert: Check that the result is correct
 */

describe('HopService', () => {
  let service: HopService;

  /**
   * STEP 16.1: Test Setup
   * ======================
   *
   * Before each test, we create a fresh instance of HopService.
   * This ensures tests don't interfere with each other.
   *
   * Think of it like cleaning your workspace before starting a new project.
   */
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HopService],
    }).compile();

    service = module.get<HopService>(HopService);
  });

  /**
   * STEP 16.2: Basic Sanity Test
   * =============================
   *
   * Always start with a simple test to ensure the service can be created.
   * If this fails, something is very wrong with the setup.
   */
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * STEP 17: Testing Route Normalization
   * =====================================
   *
   * These tests verify that our normalizeRoute function correctly
   * transforms Hop API data into our standard BridgeRoute format.
   */
  describe('normalizeRoute', () => {
    /**
     * Test Case 1: Complete Route Data
     * =================================
     *
     * This tests the happy path - when Hop API returns all the data we expect.
     *
     * What we're checking:
     * - All fields are populated correctly
     * - Fee calculations are accurate
     * - Metadata is properly structured
     */
    it('should normalize a complete Hop route response', () => {
      // Arrange: Create mock data that looks like Hop API response
      const rawRoute = {
        estimatedReceived: '998000',
        amountOutMin: '995000',
        bonderFee: '1000',
        lpFee: '500',
        destinationTxFee: '500',
        gasEstimate: '150000',
        deadline: 1706287605,
      };

      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000', // 1 USDC (6 decimals)
      };

      // Act: Call the function we're testing
      const result = service.normalizeRoute(rawRoute, request);

      // Assert: Check that the output is correct
      expect(result).toBeDefined();
      expect(result.provider).toBe('hop');
      expect(result.sourceChain).toBe('ethereum');
      expect(result.targetChain).toBe('polygon');
      expect(result.inputAmount).toBe('1000000');
      expect(result.outputAmount).toBe('998000');

      // Fee should be bonderFee + lpFee + destinationTxFee = 1000 + 500 + 500 = 2000
      expect(result.fee).toBe('2000');

      // Fee percentage = (2000 / 1000000) * 100 = 0.2%
      expect(result.feePercentage).toBeCloseTo(0.2, 2);

      expect(result.minAmountOut).toBe('995000');
      expect(result.maxAmountOut).toBe('998000');
      expect(result.reliability).toBe(0.85);

      // Check metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.feeBreakdown).toBeDefined();
      expect(result.metadata?.feeBreakdown?.networkFee).toBe('500');
      expect(result.metadata?.feeBreakdown?.bridgeFee).toBe('500');
      expect(result.metadata?.feeBreakdown?.slippageFee).toBe('1000');
    });

    /**
     * Test Case 2: Minimal Route Data
     * ================================
     *
     * What happens when Hop API returns minimal data?
     * Our code should handle missing fields gracefully.
     *
     * This tests defensive programming - handling edge cases.
     */
    it('should handle missing optional fields with defaults', () => {
      // Arrange: Minimal data (only required fields)
      const rawRoute = {
        estimatedReceived: '998000',
      };

      const request: RouteRequest = {
        sourceChain: 'arbitrum',
        targetChain: 'optimism',
        assetAmount: '5000000',
      };

      // Act
      const result = service.normalizeRoute(rawRoute, request);

      // Assert: Check that defaults are used
      expect(result).toBeDefined();
      expect(result.fee).toBe('0'); // All fees default to '0'
      expect(result.feePercentage).toBeGreaterThanOrEqual(0);
      expect(result.minAmountOut).toBe('998000'); // Falls back to estimatedReceived
      expect(result.transactionData).toBeDefined();
      expect(result.transactionData?.gasEstimate).toBeUndefined();
    });

    /**
     * Test Case 3: Large Numbers (BigInt Handling)
     * =============================================
     *
     * Blockchain deals with very large numbers.
     * This test ensures our BigInt calculations work correctly.
     */
    it('should handle large amounts correctly', () => {
      // Arrange: 1000 ETH (18 decimals)
      const largeAmount = '1000000000000000000000'; // 1000 * 10^18

      const rawRoute = {
        estimatedReceived: '999000000000000000000',
        bonderFee: '500000000000000000',
        lpFee: '250000000000000000',
        destinationTxFee: '250000000000000000',
      };

      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'arbitrum',
        assetAmount: largeAmount,
      };

      // Act
      const result = service.normalizeRoute(rawRoute, request);

      // Assert
      expect(result.inputAmount).toBe(largeAmount);
      expect(result.outputAmount).toBe('999000000000000000000');

      // Total fee = 500000000000000000 + 250000000000000000 + 250000000000000000
      expect(result.fee).toBe('1000000000000000000');

      // Fee percentage should be 0.1% (1 ETH fee on 1000 ETH)
      expect(result.feePercentage).toBeCloseTo(0.1, 2);
    });

    /**
     * Test Case 4: Different Chain Pairs
     * ===================================
     *
     * Estimated time varies based on source and target chains.
     * L1→L2 is slower than L2→L2.
     */
    it('should estimate different times for different chain pairs', () => {
      const rawRoute = { estimatedReceived: '998000' };

      // Test L1 → L2 (Ethereum → Polygon)
      const l1ToL2Request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000',
      };

      const l1ToL2Result = service.normalizeRoute(rawRoute, l1ToL2Request);

      // Test L2 → L2 (Arbitrum → Optimism)
      const l2ToL2Request: RouteRequest = {
        sourceChain: 'arbitrum',
        targetChain: 'optimism',
        assetAmount: '1000000',
      };

      const l2ToL2Result = service.normalizeRoute(rawRoute, l2ToL2Request);

      // Assert: L1→L2 should take longer than L2→L2
      expect(l1ToL2Result.estimatedTime).toBeGreaterThan(l2ToL2Result.estimatedTime);
      expect(l1ToL2Result.estimatedTime).toBe(15 * 60); // 15 minutes
      expect(l2ToL2Result.estimatedTime).toBe(3 * 60);  // 3 minutes
    });
  });

  /**
   * STEP 18: Testing Fee Normalization
   * ===================================
   * 
   * These tests verify that fee data is correctly normalized.
   */
  describe('normalizeFees', () => {
    /**
     * Test Case 1: Complete Fee Data
     * ===============================
     */
    it('should normalize complete fee data', () => {
      // Arrange
      const rawFees = {
        lpFee: '1000',
        bonderFee: '500',
        destinationTxFee: '2000',
        decimals: 6,
        symbol: 'USDC',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        estimatedReceived: '998000',
        amountOutMin: '995000',
        gasEstimate: '150000',
        deadline: 1706287605,
      };

      // Act
      const result = service.normalizeFees(rawFees);

      // Assert
      expect(result.lpFee).toBe('1000');
      expect(result.bonderFee).toBe('500');
      expect(result.destinationTxFee).toBe('2000');
      expect(result.decimals).toBe(6);
      expect(result.symbol).toBe('USDC');
      expect(result.estimatedReceived).toBe('998000');
      expect(result.amountOutMin).toBe('995000');
    });

    /**
     * Test Case 2: Fallback Values
     * =============================
     *
     * When Hop API doesn't provide certain fields,
     * we should use sensible defaults.
     */
    it('should use fallback values for missing fields', () => {
      // Arrange: Empty object (worst case)
      const rawFees = {};

      // Act
      const result = service.normalizeFees(rawFees);

      // Assert: Check defaults
      expect(result.lpFee).toBe('1000');
      expect(result.bonderFee).toBe('500');
      expect(result.destinationTxFee).toBe('2000');
      expect(result.decimals).toBe(18);
      expect(result.symbol).toBe('ETH');
      expect(result.token).toBe('native');
      expect(result.sourceChain).toBe('ethereum');
      expect(result.destinationChain).toBe('polygon');
    });
  });

  /**
   * STEP 19: Testing Cache Functionality
   * =====================================
   *
   * The cache is critical for fallback behavior.
   * These tests ensure it works correctly.
   */
  describe('Cache Management', () => {
    /**
     * Test Case 1: Set and Get Cache
     * ===============================
     *
     * Basic cache operations should work.
     */
    it('should cache and retrieve quotes', () => {
      // Arrange
      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000',
        tokenAddress: 'USDC',
      };

      const quote = {
        lpFee: '1000',
        bonderFee: '500',
        destinationTxFee: '2000',
        decimals: 6,
        symbol: 'USDC',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
      };

      // Act: Store in cache
      service.setCachedQuote(request, quote);

      // Assert: Retrieve from cache
      const cached = service.getCachedQuote(request);
      expect(cached).toBeDefined();
      expect(cached?.lpFee).toBe('1000');
      expect(cached?.symbol).toBe('USDC');
    });

    /**
     * Test Case 2: Cache Miss
     * ========================
     *
     * When there's no cache entry, should return null.
     */
    it('should return null for cache miss', () => {
      // Arrange
      const request: RouteRequest = {
        sourceChain: 'arbitrum',
        targetChain: 'optimism',
        assetAmount: '5000000',
      };

      // Act
      const cached = service.getCachedQuote(request);

      // Assert
      expect(cached).toBeNull();
    });

    /**
     * Test Case 3: Cache Expiration
     * ==============================
     *
     * Old cache entries should expire and return null.
     *
     * Note: This test uses fake timers to simulate time passing.
     */
    it('should expire old cache entries', () => {
      // Arrange
      jest.useFakeTimers();

      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000',
      };

      const quote = {
        lpFee: '1000',
        bonderFee: '500',
        destinationTxFee: '2000',
        decimals: 6,
        symbol: 'USDC',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
      };

      // Act: Cache the quote
      service.setCachedQuote(request, quote);

      // Verify it's cached
      expect(service.getCachedQuote(request)).toBeDefined();

      // Fast-forward time by 6 minutes (cache TTL is 5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Assert: Cache should be expired
      const expired = service.getCachedQuote(request);
      expect(expired).toBeNull();

      jest.useRealTimers();
    });
  });

  /**
   * STEP 20: Testing Fallback Behavior
   * ===================================
   * 
   * When the API fails, we need reliable fallback fees.
   */
  describe('getFallbackFees', () => {
    /**
     * Test Case 1: USDC Fallback
     * ===========================
     * 
     * USDC has 6 decimals, so 1 USDC = 1,000,000 smallest units.
     */
    it('should return fallback fees for USDC', () => {
      // Act
      const fallback = service.getFallbackFees('USDC', 'ethereum', 'polygon');

      // Assert
      expect(fallback.symbol).toBe('USDC');
      expect(fallback.decimals).toBe(6);
      expect(fallback.sourceChain).toBe('ethereum');
      expect(fallback.destinationChain).toBe('polygon');
      
      // Fees should be reasonable percentages
      const baseAmount = Math.pow(10, 6); // 1 USDC
      expect(parseInt(fallback.lpFee)).toBe(Math.floor(baseAmount * 0.0004));
      expect(parseInt(fallback.bonderFee)).toBe(Math.floor(baseAmount * 0.0002));
      expect(parseInt(fallback.destinationTxFee)).toBe(Math.floor(baseAmount * 0.001));
    });

    /**
     * Test Case 2: ETH Fallback
     * ==========================
     * 
     * ETH has 18 decimals, so 1 ETH = 1,000,000,000,000,000,000 wei.
     */
    it('should return fallback fees for ETH', () => {
      // Act
      const fallback = service.getFallbackFees('ETH', 'ethereum', 'arbitrum');

      // Assert
      expect(fallback.symbol).toBe('ETH');
      expect(fallback.decimals).toBe(18);
      
      // Fees should scale with decimals
      const baseAmount = Math.pow(10, 18); // 1 ETH
      expect(parseInt(fallback.lpFee)).toBe(Math.floor(baseAmount * 0.0004));
    });

    /**
     * Test Case 3: Unknown Token
     * ===========================
     * 
     * For unknown tokens, default to 18 decimals.
     */
    it('should default to 18 decimals for unknown tokens', () => {
      // Act
      const fallback = service.getFallbackFees('UNKNOWN', 'ethereum', 'polygon');

      // Assert
      expect(fallback.decimals).toBe(18);
    });
  });

  /**
   * STEP 21: Edge Cases and Error Handling
   * =======================================
   * 
   * Good tests cover edge cases and error scenarios.
   */
  describe('Edge Cases', () => {
    /**
     * Test Case 1: Zero Amount
     * =========================
     * 
     * What happens with zero input amount?
     */
    it('should handle zero input amount', () => {
      // Arrange
      const rawRoute = {
        estimatedReceived: '0',
        bonderFee: '0',
        lpFee: '0',
        destinationTxFee: '0',
      };

      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '0',
      };

      // Act
      const result = service.normalizeRoute(rawRoute, request);

      // Assert
      expect(result.inputAmount).toBe('0');
      expect(result.outputAmount).toBe('0');
      expect(result.feePercentage).toBe(0); // Avoid division by zero
    });

    /**
     * Test Case 2: Very Small Amounts
     * ================================
     * 
     * Dust amounts should still be handled correctly.
     */
    it('should handle very small amounts', () => {
      // Arrange: 1 wei (smallest ETH unit)
      const rawRoute = {
        estimatedReceived: '1',
        bonderFee: '0',
        lpFee: '0',
        destinationTxFee: '0',
      };

      const request: RouteRequest = {
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1',
      };

      // Act
      const result = service.normalizeRoute(rawRoute, request);

      // Assert
      expect(result.inputAmount).toBe('1');
      expect(result.outputAmount).toBe('1');
      expect(result.feePercentage).toBe(0);
    });
  });
});
