import { StatusCommand } from '../status.command';

describe('StatusCommand', () => {
  let command: StatusCommand;
  const validTxHash = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F1234567890abcdef12345678';

  beforeEach(() => {
    command = new StatusCommand();
  });

  it('should query cross-chain lifecycle status for a valid transaction hash', async () => {
    const result = await command.execute([validTxHash], {});

    expect(result.success).toBe(true);
    expect(result.data?.txHash).toBe(validTxHash);
    expect(result.data?.sourceChain).toBe('Ethereum');
    expect(result.data?.destinationChain).toBe('Stellar');
    expect(result.data?.milestones).toHaveLength(3);
    expect(result.data?.milestones[0].name).toBe('Source Lock');
    expect(result.data?.milestones[1].name).toBe('Relayer Verification');
    expect(result.data?.milestones[2].name).toBe('Destination Mint/Release');
    expect(result.message).toContain('BRIDGEWISE CROSS-CHAIN TRANSACTION LIFECYCLE STATUS');
  });

  it('should respect --source-chain option when specified', async () => {
    const result = await command.execute([validTxHash], { 'source-chain': 'Stellar' });

    expect(result.success).toBe(true);
    expect(result.data?.sourceChain).toBe('Stellar');
    expect(result.data?.destinationChain).toBe('Ethereum');
  });

  it('should handle missing transaction hash gracefully', async () => {
    const result = await command.execute([], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transaction hash is required');
  });

  it('should handle invalid transaction hash format gracefully', async () => {
    const result = await command.execute(['invalid_hash_string'], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transaction hash');
  });

  it('should handle unsupported source chain error gracefully', async () => {
    const result = await command.execute([validTxHash], { 'source-chain': 'NonExistentChain' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported source chain');
  });
});
