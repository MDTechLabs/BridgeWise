import { StatusChecker } from '../status-checker';

declare const describe: any;
declare const beforeEach: any;
declare const it: any;
declare const expect: any;

describe('StatusChecker', () => {
  let statusChecker: StatusChecker;
  const validEvmHash = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F1234567890abcdef12345678';
  const validStellarHash = '71C7656EC7ab88b098defB751B7401B5f6d8976F1234567890abcdef12345678';

  beforeEach(() => {
    statusChecker = new StatusChecker();
  });

  describe('isValidTxHash', () => {
    it('should validate EVM 0x-prefixed 64-char hex hash', () => {
      expect(StatusChecker.isValidTxHash(validEvmHash)).toBe(true);
    });

    it('should validate 64-char raw hex hash', () => {
      expect(StatusChecker.isValidTxHash(validStellarHash)).toBe(true);
    });

    it('should reject invalid non-hex hash strings', () => {
      expect(StatusChecker.isValidTxHash('invalid_hash')).toBe(false);
      expect(StatusChecker.isValidTxHash('')).toBe(false);
      expect(StatusChecker.isValidTxHash('0x123')).toBe(false);
    });
  });

  describe('normalizeChain', () => {
    it('should normalize valid chain names regardless of casing', () => {
      expect(StatusChecker.normalizeChain('ethereum')).toBe('Ethereum');
      expect(StatusChecker.normalizeChain('STELLAR')).toBe('Stellar');
      expect(StatusChecker.normalizeChain('Polygon')).toBe('Polygon');
    });

    it('should return null for unsupported chains', () => {
      expect(StatusChecker.normalizeChain('UnknownChain')).toBeNull();
    });
  });

  describe('checkStatus', () => {
    it('should return full cross-chain milestone details for a valid hash', async () => {
      const result = await statusChecker.checkStatus(validEvmHash);

      expect(result.txHash).toBe(validEvmHash);
      expect(result.sourceChain).toBe('Ethereum');
      expect(result.destinationChain).toBe('Stellar');
      expect(result.status).toBe('Relayed');
      expect(result.milestones).toHaveLength(3);
      expect(result.milestones[0]).toEqual(
        expect.objectContaining({ name: 'Source Lock', status: 'completed' })
      );
      expect(result.milestones[1]).toEqual(
        expect.objectContaining({ name: 'Relayer Verification', status: 'completed' })
      );
      expect(result.milestones[2]).toEqual(
        expect.objectContaining({ name: 'Destination Mint/Release', status: 'completed' })
      );
    });

    it('should handle custom sourceChain option', async () => {
      const result = await statusChecker.checkStatus(validEvmHash, { sourceChain: 'Stellar' });

      expect(result.sourceChain).toBe('Stellar');
      expect(result.destinationChain).toBe('Ethereum');
    });

    it('should throw error for invalid transaction hash', async () => {
      await expect(statusChecker.checkStatus('invalid_hash')).rejects.toThrow(
        'Invalid transaction hash: invalid_hash'
      );
    });

    it('should throw error for unsupported source chain', async () => {
      await expect(
        statusChecker.checkStatus(validEvmHash, { sourceChain: 'InvalidChain' })
      ).rejects.toThrow('Unsupported source chain');
    });
  });
});
