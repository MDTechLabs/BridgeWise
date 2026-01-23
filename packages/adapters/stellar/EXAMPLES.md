/**
 * Example: Complete Bridge Transfer Flow
 * Demonstrates how to use @bridgewise/stellar-adapter for end-to-end bridge operations
 */

import {
  createStellarAdapter,
  FreighterProvider,
  BridgeContract,
  StellarBridgeExecutor,
  BridgeTransactionDetails,
} from '@bridgewise/stellar-adapter';

// ============================================================================
// EXAMPLE 1: Basic Bridge Transfer
// ============================================================================

async function basicBridgeTransfer() {
  console.log('=== Example 1: Basic Bridge Transfer ===\n');

  try {
    // Create and configure adapter
    const adapter = createStellarAdapter(
      'https://soroban-rpc.mainnet.stellar.org',
      'https://horizon.stellar.org',
      'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
      'mainnet'
    );

    // Connect wallet
    const connection = await adapter.connectAndPrepare('mainnet');
    console.log(`✓ Connected wallet: ${connection.publicKey}`);

    // Define transfer
    const transfer: BridgeTransactionDetails = {
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      sourceAmount: '1000000000', // 10 XLM in stroops
      destinationAmount: '0.5',
      recipient: connection.publicKey,
      fee: '1000',
      estimatedTime: 30,
    };

    // Estimate costs
    const cost = await adapter.estimateTransferCost(transfer);
    console.log(`✓ Estimated fees:`);
    console.log(`  - Network: ${cost.networkFee} XLM`);
    console.log(`  - Bridge: ${cost.bridgeFee} XLM`);
    console.log(`  - Gas: ${cost.gasEstimate} stroops\n`);

    // Execute transfer
    const result = await adapter.executeTransfer(transfer, {
      slippage: 100, // 1%
    });

    if (result.success) {
      console.log(`✓ Transfer executed: ${result.transactionHash}`);
      console.log(`  Status: ${result.details?.status}`);
      console.log(`  Amount: ${result.details?.bridgeAmount}`);
    } else {
      console.error(`✗ Transfer failed: ${result.error}`);
    }

    // Disconnect
    adapter.disconnect();
    console.log('✓ Wallet disconnected\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 2: Fee Estimation and Optimization
// ============================================================================

async function feeOptimization() {
  console.log('=== Example 2: Fee Estimation and Network Optimization ===\n');

  try {
    const adapter = createStellarAdapter(
      'https://soroban-rpc.mainnet.stellar.org',
      'https://horizon.stellar.org',
      'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
      'mainnet'
    );

    await adapter.connectAndPrepare('mainnet');

    // Get network statistics
    const stats = await adapter.getNetworkStats();
    console.log(`Network Statistics:`);
    console.log(`  - Base Fee: ${stats.baseFee} stroops`);
    console.log(`  - Average Block Time: ${stats.averageTime}s`);
    console.log(`  - Pending Transactions: ${stats.pendingTransactions}\n`);

    // Analyze different transfer scenarios
    const scenarios = [
      {
        name: 'Small Transfer (1 XLM)',
        amount: '10000000',
        targetChain: 'ethereum',
      },
      {
        name: 'Medium Transfer (10 XLM)',
        amount: '100000000',
        targetChain: 'polygon',
      },
      {
        name: 'Large Transfer (100 XLM)',
        amount: '1000000000',
        targetChain: 'arbitrum',
      },
    ];

    for (const scenario of scenarios) {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: scenario.targetChain,
        sourceAmount: scenario.amount,
        destinationAmount: '0',
        recipient: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ',
        fee: '1000',
        estimatedTime: 30,
      };

      const cost = await adapter.estimateTransferCost(transfer);
      const feePercent = (
        (parseFloat(cost.totalFee) / parseFloat(scenario.amount)) *
        100
      ).toFixed(4);

      console.log(`${scenario.name}:`);
      console.log(`  - Total Fee: ${cost.totalFee} XLM (${feePercent}%)`);
      console.log(`  - Gas Estimate: ${cost.gasEstimate}`);
    }

    adapter.disconnect();
    console.log('\n✓ Optimization analysis complete\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 3: Error Handling and Recovery
// ============================================================================

async function errorHandlingExample() {
  console.log('=== Example 3: Error Handling and Recovery ===\n');

  const adapter = createStellarAdapter(
    'https://soroban-rpc.mainnet.stellar.org',
    'https://horizon.stellar.org',
    'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
    'mainnet'
  );

  // Handle connection errors
  try {
    await adapter.connectAndPrepare('mainnet');
    console.log('✓ Wallet connected');
  } catch (error) {
    console.error('✗ Failed to connect wallet:', error);
    console.log('  → Install Freighter wallet and try again\n');
    return;
  }

  // Handle validation errors
  const invalidTransfers = [
    {
      name: 'Invalid recipient',
      transfer: {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: 'INVALID_ADDRESS', // Too short
        fee: '1000',
        estimatedTime: 30,
      } as BridgeTransactionDetails,
    },
    {
      name: 'Zero amount',
      transfer: {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '0',
        destinationAmount: '0',
        recipient: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ',
        fee: '0',
        estimatedTime: 30,
      } as BridgeTransactionDetails,
    },
    {
      name: 'Missing recipient',
      transfer: {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '1000000000',
        destinationAmount: '0.5',
        recipient: '', // Empty
        fee: '1000',
        estimatedTime: 30,
      } as BridgeTransactionDetails,
    },
  ];

  for (const { name, transfer } of invalidTransfers) {
    console.log(`Testing: ${name}`);
    const result = await adapter.executeTransfer(transfer);
    if (!result.success) {
      console.log(`  ✓ Correctly rejected: ${result.error}\n`);
    } else {
      console.log(`  ✗ Should have been rejected!\n`);
    }
  }

  adapter.disconnect();
  console.log('✓ Error handling tests complete\n');
}

// ============================================================================
// EXAMPLE 4: Monitoring Transfer Status
// ============================================================================

async function monitorTransferStatus() {
  console.log('=== Example 4: Transfer Status Monitoring ===\n');

  const adapter = createStellarAdapter(
    'https://soroban-rpc.mainnet.stellar.org',
    'https://horizon.stellar.org',
    'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
    'mainnet'
  );

  try {
    const connection = await adapter.connectAndPrepare('mainnet');

    const transfer: BridgeTransactionDetails = {
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      sourceAmount: '1000000000',
      destinationAmount: '0.5',
      recipient: connection.publicKey,
      fee: '1000',
      estimatedTime: 30,
    };

    const result = await adapter.executeTransfer(transfer);

    if (result.success && result.transactionHash) {
      console.log(`Transfer initiated: ${result.transactionHash}\n`);

      // Monitor status with exponential backoff
      let isComplete = false;
      let checkCount = 0;
      const maxChecks = 5;
      let delayMs = 5000;

      while (!isComplete && checkCount < maxChecks) {
        await new Promise((r) => setTimeout(r, delayMs));
        checkCount++;

        try {
          const status = await adapter.getTransferStatus(
            result.transactionHash
          );
          console.log(
            `Check ${checkCount}: Status = ${status.status} (${new Date().toLocaleTimeString()})`
          );

          if (status.status === 'confirmed') {
            console.log(`✓ Transfer confirmed!`);
            console.log(`  Bridge Amount: ${status.bridgeAmount}`);
            isComplete = true;
          } else if (status.status === 'failed') {
            console.log(`✗ Transfer failed`);
            isComplete = true;
          }

          // Exponential backoff (5s, 10s, 20s, 40s, 80s)
          delayMs = Math.min(delayMs * 2, 120000);
        } catch (error) {
          console.error(
            `  Query error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (!isComplete) {
        console.log('ℹ Transfer still pending, check manually later');
      }
    } else {
      console.error(`Transfer submission failed: ${result.error}`);
    }

    adapter.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n✓ Status monitoring example complete\n');
}

// ============================================================================
// EXAMPLE 5: Batch Multiple Transfers
// ============================================================================

async function batchTransfers() {
  console.log('=== Example 5: Batch Transfer Operations ===\n');

  const adapter = createStellarAdapter(
    'https://soroban-rpc.mainnet.stellar.org',
    'https://horizon.stellar.org',
    'CBQHNAXSI55GNXVQOMATOI7NSZZEC63R2ZWXEWWDX5SQ6V6N7RRYLNNQ',
    'mainnet'
  );

  try {
    const connection = await adapter.connectAndPrepare('mainnet');

    const recipients = [
      'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTZSGYCON5JSXC2H7YVSTQQLYJ',
      'GCZST3XVCDTUJ76ZAV2HA72KYKT4F7GB5P4V4SOisær42XJLCES23BQJA',
      'GBBD47UZQ5PEsolomon23WFFDBC4MQZ5RIV5XE7HDEFY7C7INXOUT7QC',
    ];

    const results = [];

    console.log(`Processing ${recipients.length} transfers...\n`);

    for (let i = 0; i < recipients.length; i++) {
      const transfer: BridgeTransactionDetails = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        sourceAmount: '100000000', // 1 XLM each
        destinationAmount: '0.05',
        recipient: recipients[i],
        fee: '1000',
        estimatedTime: 30,
      };

      console.log(`[${i + 1}/${recipients.length}] Processing transfer...`);

      const result = await adapter.executeTransfer(transfer, {
        slippage: 100,
      });

      results.push({
        recipient: recipients[i],
        success: result.success,
        hash: result.transactionHash,
        error: result.error,
      });

      console.log(
        `  ${result.success ? '✓' : '✗'} ${result.success ? result.transactionHash : result.error}\n`
      );

      // Add delay between transfers to avoid rate limiting
      if (i < recipients.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Summary
    console.log('=== Batch Transfer Summary ===');
    const successful = results.filter((r) => r.success).length;
    console.log(`Successful: ${successful}/${recipients.length}`);
    console.log(`Failed: ${recipients.length - successful}/${recipients.length}\n`);

    adapter.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }

  console.log('✓ Batch transfer example complete\n');
}

// ============================================================================
// Run Examples
// ============================================================================

async function runExamples() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  @bridgewise/stellar-adapter - Usage Examples                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Uncomment to run specific examples:

  // await basicBridgeTransfer();
  // await feeOptimization();
  // await errorHandlingExample();
  // await monitorTransferStatus();
  // await batchTransfers();

  console.log('Examples are available. Uncomment specific examples in runExamples() to execute.\n');
  console.log(
    'Note: These examples require Freighter wallet and proper network configuration.\n'
  );
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  basicBridgeTransfer,
  feeOptimization,
  errorHandlingExample,
  monitorTransferStatus,
  batchTransfers,
};
