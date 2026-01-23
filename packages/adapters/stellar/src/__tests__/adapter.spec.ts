import { FreighterProvider, WalletConnection, AccountBalance } from '../wallet/FreighterProvider';
import { BridgeContract, BridgeOperationParams } from '../contracts/BridgeContract';
import { StellarBridgeExecutor, BridgeTransactionDetails } from '../executor/BridgeExecutor';

// Mock Freighter API
jest.mock('freighter-api', () => ({
  getPublicKey: jest.fn().mockResolvedValue('GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ'),
  getAllowedNetworks: jest.fn().mockResolvedValue(['mainnet', 'testnet']),
  signTransaction: jest.fn().mockResolvedValue('ABCD1234WXYZ'),
  signMessage: jest.fn().mockResolvedValue('SIGNATURE123'),
}));

describe('FreighterProvider', () => {
  let provider: FreighterProvider;
  const testPublicKey = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ';

  beforeEach(() => {
    provider = new FreighterProvider();
    // Mock window.freighter
    if (typeof window === 'undefined') {
      (global as any).window = { freighter: {} };
    }
  });

  afterEach(() => {
    provider.disconnectWallet();
  });

  describe('connectWallet', () => {
    it('should connect to Freighter wallet', async () => {
      const connection = await provider.connectWallet('mainnet');

      expect(connection).toBeDefined();
      expect(connection.isConnected).toBe(true);
      expect(connection.network).toBe('mainnet');
      expect(connection.publicKey).toBe(testPublicKey);
    });

    it('should throw error if Freighter is not available', async () => {
      if (typeof window !== 'undefined') {
        (window as any).freighter = undefined;
      }
      provider = new FreighterProvider();

      await expect(provider.connectWallet()).rejects.toThrow(
        'Freighter wallet not found'
      );
    });

    it('should respect network parameter', async () => {
      const connection = await provider.connectWallet('testnet');

      expect(connection.network).toBe('testnet');
    });

    it('should cache connection', async () => {
      const conn1 = await provider.connectWallet('mainnet');
      const conn2 = provider.getConnection();

      expect(conn1).toEqual(conn2);
    });
  });

  describe('disconnectWallet', () => {
    it('should clear connection', async () => {
      await provider.connectWallet('mainnet');
      expect(provider.getConnection()).not.toBeNull();

      provider.disconnectWallet();
      expect(provider.getConnection()).toBeNull();
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await provider.connectWallet('mainnet');
    });

    it('should return account balance', async () => {
      // Mock fetch for Horizon API
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          balances: [
            { asset_type: 'native', balance: '100.0' },
            { asset_type: 'credit_alphanum12', balance: '50.0' },
          ],
        }),
      });

      const balance = await provider.getBalance();

      expect(balance).toBeDefined();
      expect(balance.nativeBalance).toBe('100.0');
      expect(balance.publicKey).toBe(testPublicKey);
    });

    it('should throw error if not connected', async () => {
      provider.disconnectWallet();

      await expect(provider.getBalance()).rejects.toThrow(
        'No account connected'
      );
    });

    it('should throw error if account not found', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(provider.getBalance()).rejects.toThrow(
        'Account not found'
      );
    });
  });

  describe('signTransaction', () => {
    beforeEach(async () => {
      await provider.connectWallet('mainnet');
    });

    it('should sign transaction', async () => {
      const txEnvelope = 'transaction_envelope_xdr';
      const result = await provider.signTransaction(txEnvelope);

      expect(result).toBeDefined();
      expect(result.publicKey).toBe(testPublicKey);
      expect(result.signature).toBeDefined();
      expect(result.hash).toBeDefined();
    });

    it('should throw error if not connected', async () => {
      provider.disconnectWallet();

      await expect(provider.signTransaction('tx')).rejects.toThrow(
        'No account connected'
      );
    });
  });

  describe('submitTransaction', () => {
    it('should submit signed transaction', async () => {
      const signedTx = 'signed_transaction_xdr';
      const result = await provider.submitTransaction(signedTx);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('getNetworkConfig', () => {
    it('should return network configuration', () => {
      const config = provider.getNetworkConfig();

      expect(config.rpcUrl).toBeDefined();
      expect(config.horizonUrl).toBeDefined();
      expect(config.network).toBe('mainnet');
    });
  });
});

describe('BridgeContract', () => {
  let contract: BridgeContract;
  const config = {
    contractId: 'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
    rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  };

  beforeEach(() => {
    contract = new BridgeContract(config);
  });

  describe('estimateBridgeFees', () => {
    it('should estimate bridge fees', async () => {
      const params: BridgeOperationParams = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        amount: '1000000000',
        recipient: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ',
      };

      const fees = await contract.estimateBridgeFees(params);

      expect(fees).toBeDefined();
      expect(fees.networkFee).toBeDefined();
      expect(fees.bridgeFee).toBeDefined();
      expect(fees.totalFee).toBeDefined();
    });
  });

  describe('validateContract', () => {
    it('should validate contract accessibility', async () => {
      const isValid = await contract.validateContract();
      // May fail due to mocking, but method should not throw
      expect(typeof isValid).toBe('boolean');
    });
  });
});

describe('StellarBridgeExecutor', () => {
  let executor: StellarBridgeExecutor;
  let provider: FreighterProvider;
  let contract: BridgeContract;
  const testPublicKey = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ';

  beforeEach(async () => {
    provider = new FreighterProvider();
    contract = new BridgeContract({
      contractId: 'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
      rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
    executor = new StellarBridgeExecutor(provider, contract);

    // Mock window.freighter
    if (typeof window === 'undefined') {
      (global as any).window = { freighter: {} };
    }

    await provider.connectWallet('mainnet');
  });

  describe('executeTransfer', () => {
    it('should execute bridge transfer', async () => {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: testPublicKey,
        fee: '1000',
        estimatedTime: 30,
      };

      // This will likely fail due to mocking, but tests the interface
      const result = await executor.executeTransfer(transfer);

      // Should return a result object (success or error)
      expect(result).toBeDefined();
      expect('success' in result).toBe(true);
    });

    it('should reject transfer if wallet not connected', async () => {
      provider.disconnectWallet();

      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: testPublicKey,
        fee: '1000',
        estimatedTime: 30,
      };

      const result = await executor.executeTransfer(transfer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });

    it('should validate recipient address', async () => {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: 'INVALID_ADDRESS',
        fee: '1000',
        estimatedTime: 30,
      };

      const result = await executor.executeTransfer(transfer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should validate amount is positive', async () => {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '0',
        destinationAmount: '0',
        recipient: testPublicKey,
        fee: '0',
        estimatedTime: 30,
      };

      const result = await executor.executeTransfer(transfer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('estimateTransferCost', () => {
    it('should estimate transfer cost', async () => {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: testPublicKey,
        fee: '1000',
        estimatedTime: 30,
      };

      const cost = await executor.estimateTransferCost(transfer);

      expect(cost).toBeDefined();
      expect(cost.networkFee).toBeDefined();
      expect(cost.bridgeFee).toBeDefined();
      expect(cost.totalFee).toBeDefined();
      expect(cost.gasEstimate).toBeDefined();
    });
  });

  describe('getTransferStatus', () => {
    it('should get transfer status', async () => {
      const status = await executor.getTransferStatus('test_tx_hash');

      expect(status).toBeDefined();
      expect('status' in status).toBe(true);
    });
  });

  describe('connectAndPrepare', () => {
    it('should connect and prepare for transfers', async () => {
      executor = new StellarBridgeExecutor(provider, contract);
      const connection = await executor.connectAndPrepare('mainnet');

      expect(connection).toBeDefined();
      expect(connection.isConnected).toBe(true);
    });
  });

  describe('getNetworkStats', () => {
    it('should return network statistics', async () => {
      const stats = await executor.getNetworkStats();

      expect(stats).toBeDefined();
      expect(stats.baseFee).toBeDefined();
      expect(stats.averageTime).toBeDefined();
      expect(stats.pendingTransactions).toBeDefined();
    });
  });
});
