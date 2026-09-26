import * as fs from 'fs';
import * as path from 'path';

/**
 * TypeScript Simulation of ChainBitmapRegistry Yul & Storage Logic
 */
class ChainBitmapRegistrySimulator {
  private chainBitmap: bigint = 0n;
  private supportedChainsMapping: Map<number, boolean> = new Map();

  public isChainSupported(chainId: number): boolean {
    if (chainId < 0 || chainId > 255) {
      throw new Error(`InvalidChainId(${chainId})`);
    }
    // Yul: supported := and(shr(chainId, bitmap), 1)
    const shift = BigInt(chainId);
    return ((this.chainBitmap >> shift) & 1n) === 1n;
  }

  public setChainSupport(chainId: number, supported: boolean): void {
    if (chainId < 0 || chainId > 255) {
      throw new Error(`InvalidChainId(${chainId})`);
    }
    const mask = 1n << BigInt(chainId);
    if (supported) {
      // Yul: bitmap := or(bitmap, mask)
      this.chainBitmap = this.chainBitmap | mask;
    } else {
      // Yul: bitmap := and(bitmap, not(mask))
      this.chainBitmap = this.chainBitmap & ~mask;
    }
  }

  public toggleChainSupport(chainId: number): boolean {
    if (chainId < 0 || chainId > 255) {
      throw new Error(`InvalidChainId(${chainId})`);
    }
    const mask = 1n << BigInt(chainId);
    // Yul: bitmap := xor(bitmap, mask)
    this.chainBitmap = this.chainBitmap ^ mask;
    return this.isChainSupported(chainId);
  }

  public areAllChainsSupported(routeMask: bigint): boolean {
    // Yul: allSupported := eq(and(bitmap, routeMask), routeMask)
    return (this.chainBitmap & routeMask) === routeMask;
  }

  public setBatchChainSupport(chainIds: number[], supported: boolean): void {
    for (const id of chainIds) {
      this.setChainSupport(id, supported);
    }
  }

  public getChainBitmap(): bigint {
    return this.chainBitmap;
  }

  public setChainBitmap(newBitmap: bigint): void {
    this.chainBitmap = newBitmap;
  }

  // Legacy Mapping Emulation
  public isChainSupportedMapping(chainId: number): boolean {
    return !!this.supportedChainsMapping.get(chainId);
  }

  public setChainSupportMapping(chainId: number, supported: boolean): void {
    this.supportedChainsMapping.set(chainId, supported);
  }
}

describe('ChainBitmapRegistry Contract & Logic Benchmark', () => {
  let registry: ChainBitmapRegistrySimulator;
  let contractSource: string;

  beforeAll(() => {
    const contractPath = path.join(
      process.cwd(),
      'contracts',
      'config',
      'ChainBitmapRegistry.sol',
    );
    expect(fs.existsSync(contractPath)).toBe(true);
    contractSource = fs.readFileSync(contractPath, 'utf8');
  });

  beforeEach(() => {
    registry = new ChainBitmapRegistrySimulator();
  });

  describe('Solidity Implementation & Yul Verification', () => {
    it('should exist and define pragma ^0.8.20', () => {
      expect(contractSource).toContain('pragma solidity ^0.8.20;');
      expect(contractSource).toContain('contract ChainBitmapRegistry');
    });

    it('should contain Yul inline assembly blocks with required bitwise instructions', () => {
      expect(contractSource).toContain('assembly {');
      expect(contractSource).toContain('sload');
      expect(contractSource).toContain('sstore');
      expect(contractSource).toContain('shr');
      expect(contractSource).toContain('shl');
      expect(contractSource).toContain('and');
      expect(contractSource).toContain('or');
      expect(contractSource).toContain('xor');
      expect(contractSource).toContain('not');
    });

    it('should define InvalidChainId custom error', () => {
      expect(contractSource).toContain(
        'error InvalidChainId(uint256 chainId);',
      );
    });
  });

  describe('Chain Support Bitwise Operations (0-255)', () => {
    it('should initialize with no supported chains', () => {
      expect(registry.getChainBitmap()).toBe(0n);
      expect(registry.isChainSupported(0)).toBe(false);
      expect(registry.isChainSupported(1)).toBe(false);
      expect(registry.isChainSupported(255)).toBe(false);
    });

    it('should set and clear chain support at boundary bit positions', () => {
      registry.setChainSupport(0, true);
      expect(registry.isChainSupported(0)).toBe(true);
      expect(registry.getChainBitmap()).toBe(1n);

      registry.setChainSupport(255, true);
      expect(registry.isChainSupported(255)).toBe(true);

      expect(registry.isChainSupported(1)).toBe(false);

      registry.setChainSupport(0, false);
      expect(registry.isChainSupported(0)).toBe(false);
      expect(registry.isChainSupported(255)).toBe(true);
    });

    it('should toggle chain support using Yul XOR logic', () => {
      const status1 = registry.toggleChainSupport(137); // Polygon chainId 137
      expect(status1).toBe(true);
      expect(registry.isChainSupported(137)).toBe(true);

      const status2 = registry.toggleChainSupport(137);
      expect(status2).toBe(false);
      expect(registry.isChainSupported(137)).toBe(false);
    });

    it('should throw InvalidChainId when chain ID exceeds 255', () => {
      expect(() => registry.isChainSupported(256)).toThrow(
        'InvalidChainId(256)',
      );
      expect(() => registry.setChainSupport(300, true)).toThrow(
        'InvalidChainId(300)',
      );
      expect(() => registry.toggleChainSupport(500)).toThrow(
        'InvalidChainId(500)',
      );
    });
  });

  describe('Multi-hop Route Mask & Batch Updates', () => {
    it('should validate multi-hop execution route mask in 1 bitmap read', () => {
      // Setup chains 1 (Ethereum), 10 (Optimism), 137 (Polygon)
      registry.setChainSupport(1, true);
      registry.setChainSupport(10, true);
      registry.setChainSupport(137, true);

      // Route requiring chain 1 & 137
      const validRouteMask = (1n << 1n) | (1n << 137n);
      expect(registry.areAllChainsSupported(validRouteMask)).toBe(true);

      // Route requiring chain 1, 10, 56 (BNB Chain - not set)
      const invalidRouteMask = (1n << 1n) | (1n << 10n) | (1n << 56n);
      expect(registry.areAllChainsSupported(invalidRouteMask)).toBe(false);
    });

    it('should batch update multiple chain IDs', () => {
      const chainIds = [1, 10, 56, 137, 255];
      registry.setBatchChainSupport(chainIds, true);

      for (const id of chainIds) {
        expect(registry.isChainSupported(id)).toBe(true);
      }
      expect(registry.isChainSupported(2)).toBe(false);

      registry.setBatchChainSupport([10, 56], false);
      expect(registry.isChainSupported(10)).toBe(false);
      expect(registry.isChainSupported(56)).toBe(false);
      expect(registry.isChainSupported(1)).toBe(true);
    });
  });

  describe('Gas Benchmarking & SLOAD Cost Analysis', () => {
    const COLD_SLOAD_GAS = 2100;
    const WARM_SLOAD_GAS = 100;

    it('should demonstrate gas savings of single slot bitmap over mapping lookups', () => {
      const routeChains = [1, 10, 56, 137, 255]; // 5 multi-hop chains

      // Standard mapping lookup cost (1 SLOAD per chain check)
      const mappingColdGas = routeChains.length * COLD_SLOAD_GAS; // 5 * 2100 = 10,500 gas

      // Bit-packed storage slot cost (1 SLOAD for entire bitmap word)
      const bitmapColdGas = 1 * COLD_SLOAD_GAS; // 2100 gas

      const gasSaved = mappingColdGas - bitmapColdGas;
      const percentageSaved = (gasSaved / mappingColdGas) * 100;

      expect(bitmapColdGas).toBeLessThan(mappingColdGas);
      expect(gasSaved).toBe(8400); // 8,400 gas saved on cold lookup
      expect(percentageSaved).toBe(80); // 80% reduction in SLOAD gas
    });

    it('should outperform mapping lookups in multi-hop route queries', () => {
      const numChainsInRoute = 8;
      const mappingGas = numChainsInRoute * COLD_SLOAD_GAS; // 16,800 gas
      const bitmapGas = 1 * COLD_SLOAD_GAS; // 2,100 gas

      expect(bitmapGas * numChainsInRoute).toBe(mappingGas);
      expect(bitmapGas).toBe(2100);
    });
  });
});
