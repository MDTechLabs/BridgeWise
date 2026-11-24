import { TokenRegistry } from './token-registry';
import { TokenMapping } from './token-registry.interface';

function mapping(address: string, symbol: string): TokenMapping {
  return {
    sourceToken: { symbol, name: symbol, decimals: 18, address, chain: 'ethereum' },
    destinationToken: {
      symbol,
      name: symbol,
      decimals: 7,
      address: `stellar-${symbol}`,
      chain: 'stellar',
    },
    provider: 'layerzero',
    isActive: true,
    conversionRate: '1',
    minAmount: '0',
    maxAmount: '1000000',
  };
}

describe('TokenRegistry.getMapping ambiguous identifiers (#1444)', () => {
  it('rejects an identifier that matches more than one distinct token across the chain namespace', async () => {
    const registry = new TokenRegistry();
    // Token B's symbol happens to collide with Token A's address string.
    await registry.registerMapping(mapping('0xabc', 'USDC'));
    await registry.registerMapping(mapping('USDC', 'WRAPPED'));

    await expect(
      registry.getMapping('ethereum', 'stellar', 'USDC', 'layerzero'),
    ).rejects.toThrow(/ambiguous/i);
  });

  it('still resolves an unambiguous identifier', async () => {
    const registry = new TokenRegistry();
    await registry.registerMapping(mapping('0xabc', 'USDC'));

    const result = await registry.getMapping('ethereum', 'stellar', 'USDC', 'layerzero');
    expect(result?.sourceToken.address).toBe('0xabc');
  });
});
