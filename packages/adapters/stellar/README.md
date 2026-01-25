# @bridgewise/stellar-adapter

Stellar/Soroban bridge adapter with first-class Freighter wallet integration and low-latency bridge transaction execution.

## Overview

This package provides a complete Stellar adapter for the BridgeWise ecosystem, enabling seamless bridging between Stellar and other blockchain networks through Soroban smart contracts. It features native Freighter wallet support, optimized transaction execution, and comprehensive fee estimation.

## Features

- **Freighter Wallet Integration**: Direct wallet connection, balance queries, and transaction signing
- **Soroban Contract Interface**: Build and execute bridge operations through Soroban contracts
- **Transaction Executor**: Optimized bridge transfer execution with full error handling
- **Fee Estimation**: Accurate network and bridge fee calculations
- **Low-Latency Design**: Optimized for performance on par with or superior to EVM routing paths
- **Network Statistics**: Real-time network metrics for optimization

## Installation

```bash
npm install @bridgewise/stellar-adapter
```

## Quick Start

### Basic Setup

```typescript
import { createStellarAdapter } from '@bridgewise/stellar-adapter';

// Create a configured adapter instance
const adapter = createStellarAdapter(
  'https://soroban-rpc.mainnet.stellar.org',
  'https://horizon.stellar.org',
  'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ', // Contract ID
  'mainnet'
);

// Connect wallet
const connection = await adapter.connectAndPrepare('mainnet');
console.log(`Connected: ${connection.publicKey}`);
```

### Execute a Bridge Transfer

```typescript
// Define transfer details
const transfer = {
  sourceChain: 'stellar',
  targetChain: 'ethereum',
  sourceAmount: '1000000000', // 10 XLM in stroops
  destinationAmount: '0.5', // Approximate ETH amount
  recipient: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ',
  fee: '1000', // in stroops
  estimatedTime: 30, // seconds
};

// Execute transfer
const result = await adapter.executeTransfer(transfer, {
  slippage: 100, // 1% slippage tolerance
  deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});

if (result.success) {
  console.log(`Transfer submitted: ${result.transactionHash}`);
  console.log(`Status: ${result.details?.status}`);
} else {
  console.error(`Transfer failed: ${result.error}`);
}
```

## API Reference

### FreighterProvider

Handles Freighter wallet connection and signing operations.

#### Constructor

```typescript
new FreighterProvider(
  rpcUrl?: string,  // Default: Stellar mainnet RPC
  horizonUrl?: string  // Default: Stellar Horizon API
)
```

#### Methods

##### `connectWallet(network?: 'mainnet' | 'testnet'): Promise<WalletConnection>`

Connect to the Freighter wallet.

```typescript
const connection = await provider.connectWallet('mainnet');
// {
//   publicKey: 'GBUQWP3...',
//   isConnected: true,
//   network: 'mainnet'
// }
```

##### `getBalance(publicKey?: string): Promise<AccountBalance>`

Get account balance information.

```typescript
const balance = await provider.getBalance();
// {
//   publicKey: 'GBUQWP3...',
//   nativeBalance: '100.0',
//   contractBalances: {}
// }
```

##### `signTransaction(envelope: string): Promise<SignedTransaction>`

Sign a transaction with Freighter.

```typescript
const signed = await provider.signTransaction(transactionEnvelope);
// {
//   signature: '...',
//   publicKey: 'GBUQWP3...',
//   hash: '...'
// }
```

##### `submitTransaction(envelope: string): Promise<string>`

Submit a signed transaction to the network.

```typescript
const txHash = await provider.submitTransaction(signedEnvelope);
```

### BridgeContract

Manages Soroban smart contract interactions for bridge operations.

#### Constructor

```typescript
new BridgeContract({
  contractId: string,
  rpcUrl: string,
  networkPassphrase: string
})
```

#### Methods

##### `prepareBridgeTransfer(params: BridgeOperationParams, account: Account): Promise<TransactionBuilder>`

Prepare a bridge transfer transaction.

```typescript
const txBuilder = await contract.prepareBridgeTransfer({
  sourceChain: 'stellar',
  targetChain: 'ethereum',
  amount: '1000000000',
  recipient: 'GBUQWP3...',
  slippage: 100,
  deadline: Math.floor(Date.now() / 1000) + 3600
}, account);
```

##### `estimateBridgeFees(params: BridgeOperationParams): Promise<FeeEstimate>`

Estimate bridge transfer fees.

```typescript
const fees = await contract.estimateBridgeFees({
  sourceChain: 'stellar',
  targetChain: 'ethereum',
  amount: '1000000000',
  recipient: 'GBUQWP3...'
});
// {
//   networkFee: '0.00001',
//   bridgeFee: '0.005',
//   totalFee: '0.00501'
// }
```

### StellarBridgeExecutor

Main executor for bridge transfer operations.

#### Constructor

```typescript
new StellarBridgeExecutor(
  wallet: FreighterProvider,
  contract: BridgeContract,
  horizonUrl?: string
)
```

#### Methods

##### `executeTransfer(transfer: BridgeTransactionDetails, options?: TransferOptions): Promise<TransferExecutionResult>`

Execute a complete bridge transfer.

```typescript
const result = await executor.executeTransfer({
  sourceChain: 'stellar',
  targetChain: 'ethereum',
  sourceAmount: '1000000000',
  destinationAmount: '0.5',
  recipient: 'GBUQWP3...',
  fee: '1000',
  estimatedTime: 30
}, {
  slippage: 100,
  deadline: Math.floor(Date.now() / 1000) + 3600
});
```

##### `estimateTransferCost(transfer: BridgeTransactionDetails): Promise<CostEstimate>`

Estimate gas and fees for a transfer.

```typescript
const cost = await executor.estimateTransferCost(transfer);
// {
//   networkFee: '0.00001',
//   bridgeFee: '0.005',
//   totalFee: '0.00501',
//   gasEstimate: '300000'
// }
```

##### `getTransferStatus(txHash: string): Promise<BridgeOperationResult>`

Get the status of a submitted transfer.

```typescript
const status = await executor.getTransferStatus(transactionHash);
// {
//   transactionHash: '...',
//   operationId: '...',
//   status: 'confirmed' | 'pending' | 'failed',
//   bridgeAmount: '...',
//   estimatedTime: 30
// }
```

##### `connectAndPrepare(network?: 'mainnet' | 'testnet'): Promise<WalletConnection>`

Connect wallet and prepare for transfers.

```typescript
const connection = await executor.connectAndPrepare('mainnet');
```

##### `getNetworkStats(): Promise<NetworkStats>`

Get current network statistics.

```typescript
const stats = await executor.getNetworkStats();
// {
//   baseFee: 100,
//   averageTime: 5,
//   pendingTransactions: 42
// }
```

## Types

### WalletConnection

```typescript
interface WalletConnection {
  publicKey: string;
  isConnected: boolean;
  network: 'mainnet' | 'testnet';
}
```

### BridgeTransactionDetails

```typescript
interface BridgeTransactionDetails {
  sourceChain: string;
  targetChain: string;
  sourceAmount: string;
  destinationAmount: string;
  recipient: string;
  fee: string;
  estimatedTime: number;
}
```

### TransferExecutionResult

```typescript
interface TransferExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  details?: BridgeOperationResult;
}
```

### TransferOptions

```typescript
interface TransferOptions {
  slippage?: number;       // In basis points (100 = 1%)
  deadline?: number;       // Unix timestamp
  gasLimit?: number;       // Optional gas limit
  priorityFee?: string;    // Optional priority fee
}
```

## Error Handling

The adapter includes comprehensive error handling:

```typescript
try {
  const result = await executor.executeTransfer(transfer);
  
  if (!result.success) {
    console.error('Transfer failed:', result.error);
    // Handle specific error cases
    if (result.error?.includes('Invalid')) {
      // Handle validation error
    } else if (result.error?.includes('Balance')) {
      // Handle insufficient balance
    }
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Unexpected error:', error);
}
```

## Performance Considerations

### Low-Latency Optimization

The adapter is designed for minimal latency:
- Connection pooling for RPC requests
- Batch fee estimation for multiple routes
- Asynchronous operation preparation
- Optimized contract invocation

### Network Statistics

Monitor network performance:

```typescript
const stats = await executor.getNetworkStats();

if (stats.averageTime > 10) {
  console.warn('Network congestion detected');
  // Adjust slippage or add priority fee
}
```

### Fee Optimization

Get current fee metrics before submitting:

```typescript
const cost = await executor.estimateTransferCost(transfer);
const stats = await executor.getNetworkStats();

if (cost.totalFee > maxAcceptableFee) {
  console.warn('Fees too high, waiting for network to clear');
}
```

## Testing

Run the test suite:

```bash
npm test
```

The package includes comprehensive tests for:
- Freighter wallet connection and signing
- Balance queries and transaction submission
- Fee estimation accuracy
- Bridge transfer execution
- Error scenarios and edge cases

## Supported Networks

### Mainnet
- **Stellar**: Public Global Stellar Network
- **Connected Chains**: Ethereum, Polygon, Arbitrum, Optimism, Base

### Testnet
- **Stellar**: Test SDF Network
- **Connected Chains**: Same as mainnet (testnet versions)

## Best Practices

1. **Always validate addresses** before transfer:
   ```typescript
   if (!isValidStellarAddress(recipient)) {
     throw new Error('Invalid recipient address');
   }
   ```

2. **Check balance before transfer**:
   ```typescript
   const balance = await provider.getBalance();
   if (BigInt(balance.nativeBalance) < BigInt(amount)) {
     throw new Error('Insufficient balance');
   }
   ```

3. **Set appropriate slippage**:
   ```typescript
   // 1% slippage = 100 basis points
   executeTransfer(transfer, { slippage: 100 });
   ```

4. **Monitor transfer status**:
   ```typescript
   let status = await executor.getTransferStatus(txHash);
   while (status.status === 'pending') {
     await new Promise(r => setTimeout(r, 5000));
     status = await executor.getTransferStatus(txHash);
   }
   ```

## Troubleshooting

### "Freighter wallet not found"
- Install [Freighter wallet extension](https://www.freighter.app)
- Ensure the extension is enabled in your browser
- Refresh the page

### "Insufficient balance"
- Check your account balance with `getBalance()`
- Ensure amount includes network fees

### "Invalid recipient address"
- Verify Stellar address starts with 'G' and is 56 characters
- Use the Stellar lab to validate addresses

### "Transaction failed"
- Check network connectivity
- Verify contract is deployed to the target network
- Review contract invocation parameters

## Contributing

Contributions are welcome! Please ensure:
- Tests pass (`npm test`)
- Code is formatted (`npm run format`)
- Linting passes (`npm run lint`)

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [bridgewise/stellar-adapter](https://github.com/bridgewise/stellar-adapter/issues)
- Documentation: [BridgeWise Docs](https://docs.bridgewise.io)
- Discord: [BridgeWise Community](https://discord.gg/bridgewise)
