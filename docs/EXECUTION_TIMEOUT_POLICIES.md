# Execution Timeout Policies

## Overview

This document describes the execution timeout policies implemented in BridgeWise using the `SorobanTimeoutManager`. These policies ensure that transactions do not hang indefinitely and are properly tracked, monitored, and expired when they exceed configured time or retry limits.

## Implementation

The execution timeout policies are implemented in `src/soroban/timeouts/soroban-timeout-manager.ts` and provide:

- **Policy-based timeout management**: Different timeout policies for different transaction types
- **Age-based expiry**: Transactions expire after a maximum age
- **Retry limit enforcement**: Transactions expire after exceeding maximum retry attempts
- **Automatic monitoring**: Periodic checks for expired transactions
- **Callback system**: Notifications when transactions expire

## Timeout Policy Configuration

### Policy Structure

```typescript
interface TimeoutPolicy {
  id: string;              // Unique policy identifier
  maxAgeMs: number;        // Maximum age in milliseconds before expiry
  maxRetries?: number;    // Optional maximum retry limit
  description?: string;    // Optional description for debugging
}
```

### Default Policies

Recommended timeout policies for different execution scenarios:

```typescript
// Fast transactions (simple transfers)
const fastPolicy: TimeoutPolicy = {
  id: 'fast',
  maxAgeMs: 30000,        // 30 seconds
  maxRetries: 3,
  description: 'Fast execution for simple transfers'
};

// Standard transactions (cross-chain bridges)
const standardPolicy: TimeoutPolicy = {
  id: 'standard',
  maxAgeMs: 300000,       // 5 minutes
  maxRetries: 5,
  description: 'Standard execution for cross-chain operations'
};

// Complex transactions (contract interactions)
const complexPolicy: TimeoutPolicy = {
  id: 'complex',
  maxAgeMs: 600000,       // 10 minutes
  maxRetries: 7,
  description: 'Complex execution for contract interactions'
};

// Emergency transactions (urgent operations)
const emergencyPolicy: TimeoutPolicy = {
  id: 'emergency',
  maxAgeMs: 120000,       // 2 minutes
  maxRetries: 10,
  description: 'Emergency execution with higher retry limit'
};
```

## Usage Examples

### Basic Setup

```typescript
import { SorobanTimeoutManager } from '@bridgewise/soroban/timeouts';

// Create timeout manager with default policy
const timeoutManager = new SorobanTimeoutManager({
  defaultPolicy: {
    id: 'default',
    maxAgeMs: 300000,  // 5 minutes
    maxRetries: 5
  },
  checkIntervalMs: 1000  // Check every second
});

// Register additional policies
timeoutManager.addPolicy({
  id: 'fast',
  maxAgeMs: 30000,
  maxRetries: 3
});

timeoutManager.addPolicy({
  id: 'complex',
  maxAgeMs: 600000,
  maxRetries: 7
});
```

### Tracking Transactions

```typescript
// Track a transaction with default policy
const tx = timeoutManager.trackTransaction('tx-123');

// Track a transaction with specific policy
const fastTx = timeoutManager.trackTransaction('tx-456', 'fast');

// Track with metadata
const trackedTx = timeoutManager.trackTransaction(
  'tx-789',
  'standard',
  { chainId: 'ethereum', amount: '1000' }
);
```

### Status Updates

```typescript
// Mark transaction as confirmed
timeoutManager.confirmTransaction('tx-123');

// Mark transaction as failed
timeoutManager.failTransaction('tx-456');

// Cancel a pending transaction
timeoutManager.cancelTransaction('tx-789');

// Increment retry count
timeoutManager.retryTransaction('tx-123');
```

### Expiry Detection

```typescript
// Check if a specific transaction is expired
const isExpired = timeoutManager.isExpired('tx-123');

// Manually trigger expiry check
const expiredTransactions = timeoutManager.checkExpired();

// Get transaction age
const age = timeoutManager.getTransactionAge('tx-123');
```

### Callbacks

```typescript
// Register callback for specific policy timeout
timeoutManager.onTimeout('standard', (transaction, policy) => {
  console.log(`Transaction ${transaction.transactionId} expired under policy ${policy.id}`);
  // Handle expiry (e.g., notify user, cleanup resources)
});

// Register global callback for any timeout
timeoutManager.onAnyTimeout((transaction, policy) => {
  // Log all timeouts for monitoring
  logger.warn(`Transaction expired: ${transaction.transactionId}`, {
    policyId: policy.id,
    retryCount: transaction.retryCount,
    age: Date.now() - transaction.createdAt
  });
});
```

### Automatic Monitoring

```typescript
// Start automatic periodic checks
timeoutManager.start();

// Stop automatic checks
timeoutManager.stop();

// Clean up all state
timeoutManager.dispose();
```

## Transaction Lifecycle

```
1. trackTransaction() → status: 'pending'
2. Execution attempt
   - Success → confirmTransaction() → status: 'confirmed'
   - Failure → retryTransaction() → increment retryCount
3. Periodic checks
   - Age > maxAgeMs → status: 'expired'
   - retryCount > maxRetries → status: 'expired'
4. Cleanup
   - untrackTransaction() → remove from tracking
```

## Configuration Environment Variables

```bash
# Default timeout policy settings
EXECUTION_TIMEOUT_DEFAULT_MAX_AGE_MS=300000
EXECUTION_TIMEOUT_DEFAULT_MAX_RETRIES=5

# Fast transaction policy
EXECUTION_TIMEOUT_FAST_MAX_AGE_MS=30000
EXECUTION_TIMEOUT_FAST_MAX_RETRIES=3

# Complex transaction policy
EXECUTION_TIMEOUT_COMPLEX_MAX_AGE_MS=600000
EXECUTION_TIMEOUT_COMPLEX_MAX_RETRIES=7

# Monitoring interval
EXECUTION_TIMEOUT_CHECK_INTERVAL_MS=1000
```

## Integration with Transaction Services

### With Transaction Retry Service

```typescript
import { TransactionRetryService } from './transactions/retry/transaction-retry.service';
import { SorobanTimeoutManager } from '@bridgewise/soroban/timeouts';

class TransactionExecutionService {
  constructor(
    private retryService: TransactionRetryService,
    private timeoutManager: SorobanTimeoutManager
  ) {}

  async executeTransaction(transactionId: string, policyId: string = 'standard') {
    // Track transaction with timeout policy
    const tracked = this.timeoutManager.trackTransaction(transactionId, policyId);

    // Set up timeout callback
    this.timeoutManager.onTimeout(policyId, (tx) => {
      if (tx.transactionId === transactionId) {
        this.retryService.markFailed(transactionId, 'Execution timeout');
      }
    });

    try {
      // Execute transaction
      const result = await this.execute(transactionId);
      
      // Mark as confirmed on success
      this.timeoutManager.confirmTransaction(transactionId);
      return result;
    } catch (error) {
      // Increment retry count on failure
      this.timeoutManager.retryTransaction(transactionId);
      
      // Check if we should retry
      const tx = this.timeoutManager.getTransaction(transactionId);
      if (tx?.status === 'pending') {
        return this.retryService.retryTransaction(transaction);
      }
      
      throw error;
    }
  }
}
```

### With Recovery Queue Service

```typescript
import { TransactionRecoveryQueueService } from './recovery/queue/stellar/transaction-recovery-queue.service';
import { SorobanTimeoutManager } from '@bridgewise/soroban/timeouts';

class RecoveryIntegrationService {
  constructor(
    private recoveryQueue: TransactionRecoveryQueueService,
    private timeoutManager: SorobanTimeoutManager
  ) {
    // Set up timeout handler
    this.timeoutManager.onAnyTimeout((tx) => {
      // Enqueue for recovery if expired
      if (tx.status === 'expired') {
        this.recoveryQueue.enqueue({
          id: tx.transactionId,
          payload: { reason: 'timeout', retryCount: tx.retryCount }
        });
      }
    });
  }
}
```

## Monitoring and Metrics

### Tracking Statistics

```typescript
// Get transaction counts by status
const stats = timeoutManager.getStats();
// Returns: { pending: 5, confirmed: 10, expired: 2, failed: 1, cancelled: 0 }

// Get all transactions
const allTransactions = timeoutManager.getTransactions();

// Get transactions by status
const pendingTransactions = timeoutManager.getTransactions('pending');
const expiredTransactions = timeoutManager.getTransactions('expired');
```

### Recommended Metrics to Track

- **Pending transaction count**: Number of currently tracked transactions
- **Expired transaction rate**: Rate of transactions expiring
- **Average transaction age**: Mean age of pending transactions
- **Retry distribution**: Distribution of retry counts
- **Policy usage**: Which policies are most commonly used

## Best Practices

1. **Choose appropriate policies**: Match timeout policies to transaction complexity
2. **Set reasonable limits**: Balance between completion and resource usage
3. **Monitor expiry rates**: High expiry rates may indicate policy issues
4. **Use callbacks effectively**: Handle expirations gracefully
5. **Clean up completed transactions**: Use `untrackTransaction()` to free memory
6. **Test policies**: Validate timeout settings in staging environment

## Troubleshooting

### High Expiry Rate

- **Symptom**: Many transactions expiring before completion
- **Cause**: Timeout values too low for current network conditions
- **Solution**: Increase `maxAgeMs` for affected policies

### Excessive Retries

- **Symptom**: Transactions hitting retry limits
- **Cause**: Persistent network issues or incorrect retry logic
- **Solution**: Review network conditions and retry strategy

### Memory Growth

- **Symptom**: Increasing memory usage over time
- **Cause**: Completed transactions not being untracked
- **Solution**: Ensure `untrackTransaction()` is called for completed transactions

## References

- [SorobanTimeoutManager Implementation](../src/soroban/timeouts/soroban-timeout-manager.ts)
- [Timeout Manager Tests](../tests/soroban/timeouts/soroban-timeout-manager.spec.ts)
- [Transaction Retry Service](../apps/api/src/transactions/retry/transaction-retry.service.ts)
- [Recovery Queue Service](../apps/api/src/recovery/queue/stellar/transaction-recovery-queue.service.ts)

## Changelog

- 2026-09-28: Initial documentation created
