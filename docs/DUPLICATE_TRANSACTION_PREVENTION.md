# Duplicate Transaction Prevention

## Overview
Prevents users from accidentally submitting the same transaction multiple times, which can lead to duplicate transfers and fund loss.

## Implementation Details

### Core Components

1. **TransactionLockManager**: `libs/ui-components/src/transaction-lock-manager.ts`
2. **React Hook**: `libs/ui-components/src/hooks/useTransactionLock.ts`

## Features

### 1. Lock Mechanism
- Acquires a time-limited lock before transaction submission
- Automatically prevents duplicate submissions while lock is active
- Configurable lock duration (default: 30 seconds)

### 2. Concurrent Transaction Limits
- Restricts number of simultaneous transactions per user (default: 1)
- Prevents UI spamming and excessive API calls
- Automatic cleanup of expired locks

### 3. Visual Feedback
- Provides lock status indicators
- Shows countdown timer for remaining lock time
- Displays clear error messages for duplicate attempts

## Usage

### Basic Integration with React Hook

```typescript
import { useTransactionLock } from '@bridgewise/ui-components';

function BridgeForm() {
  const {
    isLocked,
    isSubmitting,
    canSubmit,
    lockTimeRemaining,
    acquireLock,
    releaseLock,
    error,
  } = useTransactionLock({
    userId: 'user-123',
    ttlMs: 30000, // 30 seconds
    onLockAcquired: (txId) => console.log('Lock acquired:', txId),
    onDuplicateDetected: (txId) => alert('Transaction already processing!'),
  });

  const handleSubmit = async (transactionData: any) => {
    const transactionId = generateTransactionId(transactionData);
    
    // Try to acquire lock
    const acquired = await acquireLock(transactionId, {
      sourceChain: transactionData.sourceChain,
      destinationChain: transactionData.destinationChain,
      amount: transactionData.amount,
    });

    if (!acquired) {
      // Duplicate detected or limit reached
      return;
    }

    try {
      // Submit transaction
      await submitTransaction(transactionData);
      
      // Success - release lock
      releaseLock();
    } catch (error) {
      // Error - release lock to allow retry
      releaseLock();
      throw error;
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      
      <button 
        type="submit" 
        disabled={!canSubmit}
      >
        {isSubmitting ? 'Submitting...' : 'Bridge Tokens'}
      </button>
      
      {isLocked && (
        <div className="lock-indicator">
          Processing... ({Math.ceil(lockTimeRemaining / 1000)}s)
        </div>
      )}
      
      {error && (
        <div className="error">
          {error}
        </div>
      )}
    </form>
  );
}
```

### Advanced: Using TransactionLockManager Directly

```typescript
import { TransactionLockManager } from '@bridgewise/ui-components';

// Create instance (e.g., in a service)
const lockManager = new TransactionLockManager({
  ttlMs: 30000,
  maxLocks: 1,
});

// In your transaction service
async function processTransaction(txData: any, userId: string) {
  const transactionId = generateUniqueId();
  
  // Attempt to acquire lock
  const result = lockManager.acquireLock(
    transactionId,
    userId,
    {
      sourceChain: txData.sourceChain,
      destinationChain: txData.destinationChain,
      amount: txData.amount,
      userAddress: txData.userAddress,
    }
  );

  if (!result.success) {
    throw new Error(result.error); // "Transaction is already being processed"
  }

  try {
    // Process transaction
    await executeTransaction(txData);
    
    // Release lock on success
    lockManager.releaseLock(transactionId);
  } catch (error) {
    // Release lock on error to allow retry
    lockManager.releaseLock(transactionId);
    throw error;
  }
}
```

## API Reference

### useTransactionLock Hook

#### Options
```typescript
interface UseTransactionLockOptions {
  userId: string;                    // Unique user identifier
  ttlMs?: number;                    // Lock duration (default: 30000ms)
  onLockAcquired?: (txId: string) => void;
  onLockReleased?: (txId: string) => void;
  onDuplicateDetected?: (txId: string) => void;
}
```

#### Return Values
```typescript
interface UseTransactionLockReturn {
  isLocked: boolean;                 // Is a lock currently active?
  isSubmitting: boolean;             // Is submission in progress?
  canSubmit: boolean;                // Can user submit now?
  activeLockId?: string;             // Current lock ID
  lockTimeRemaining: number;         // Milliseconds until lock expires
  acquireLock: (txId, metadata) => Promise<boolean>;
  releaseLock: () => void;
  error?: string;                    // Error message if any
}
```

### TransactionLockManager Class

#### Constructor Options
```typescript
interface LockOptions {
  ttlMs?: number;      // Default lock duration (30000ms)
  maxLocks?: number;   // Max concurrent locks per user (1)
}
```

#### Methods

```typescript
// Acquire a lock for a transaction
acquireLock(
  transactionId: string,
  userId: string,
  metadata: object,
  ttlMs?: number
): { 
  success: boolean; 
  error?: string; 
  lock?: TransactionLock 
}

// Manually release a lock
releaseLock(transactionId: string): boolean

// Check if transaction is locked
isLocked(transactionId: string): boolean

// Get lock details
getLock(transactionId: string): TransactionLock | undefined

// Get all locks for a user
getUserLocks(userId: string): TransactionLock[]

// Check if user can submit new transaction
canUserSubmit(userId: string): boolean

// Get time remaining on lock
getLockTimeRemaining(transactionId: string): number

// Clear all locks (for testing)
clear(): void

// Get statistics
getStats(): {
  totalActiveLocks: number;
  totalUsersWithLocks: number;
  averageLocksPerUser: number;
}
```

## Integration Patterns

### Pattern 1: Form Submission Guard

```tsx
function BridgeForm() {
  const { canSubmit, acquireLock, releaseLock } = useTransactionLock({
    userId: currentUser.id,
  });

  const handleSubmit = async (data) => {
    const txId = `${data.sourceChain}-${data.destinationChain}-${Date.now()}`;
    
    if (!await acquireLock(txId, data)) {
      return; // Duplicate prevented
    }

    try {
      await api.submitTransaction(data);
      releaseLock(); // Success
    } catch (error) {
      releaseLock(); // Allow retry
      throw error;
    }
  };

  return (
    <button disabled={!canSubmit}>
      {canSubmit ? 'Submit' : 'Processing...'}
    </button>
  );
}
```

### Pattern 2: Button-Level Protection

```tsx
function SubmitButton({ onClick, children }) {
  const { isSubmitting, acquireLock, releaseLock } = useTransactionLock({
    userId: 'current-user',
    ttlMs: 5000, // Short lock for button clicks
  });

  const handleClick = async () => {
    const txId = `click-${Date.now()}`;
    
    if (!await acquireLock(txId, {})) {
      return; // Prevent double-click
    }

    try {
      await onClick();
    } finally {
      releaseLock();
    }
  };

  return (
    <button onClick={handleClick} disabled={isSubmitting}>
      {isSubmitting ? 'Processing...' : children}
    </button>
  );
}
```

### Pattern 3: Server-Side Validation

```typescript
// apps/api/src/transactions/transactions.service.ts
import { TransactionLockManager } from '@bridgewise/ui-components';

@Injectable()
export class TransactionsService {
  private lockManager = new TransactionLockManager();

  async createTransaction(
    dto: CreateTransactionDto,
    userId: string,
  ) {
    const transactionId = this.generateTransactionId(dto);

    // Acquire server-side lock
    const lockResult = this.lockManager.acquireLock(
      transactionId,
      userId,
      {
        sourceChain: dto.sourceChain,
        destinationChain: dto.destinationChain,
        amount: dto.amount,
      },
      60000 // 60 second lock for server processing
    );

    if (!lockResult.success) {
      throw new BadRequestException({
        success: false,
        error: 'Duplicate transaction detected',
        errorCode: 'DUPLICATE_TRANSACTION',
        details: lockResult.error,
      });
    }

    try {
      // Create transaction in database
      const transaction = await this.repository.create(dto);
      
      return transaction;
    } finally {
      // Release lock after processing
      this.lockManager.releaseLock(transactionId);
    }
  }
}
```

## Testing

### Unit Tests

```typescript
import { TransactionLockManager } from '../transaction-lock-manager';

describe('TransactionLockManager', () => {
  let manager: TransactionLockManager;

  beforeEach(() => {
    manager = new TransactionLockManager({ ttlMs: 1000 });
  });

  it('should acquire lock successfully', () => {
    const result = manager.acquireLock('tx1', 'user1', { amount: '100' });
    
    expect(result.success).toBe(true);
    expect(result.lock?.id).toBe('tx1');
  });

  it('should prevent duplicate transaction', () => {
    manager.acquireLock('tx1', 'user1', { amount: '100' });
    const result = manager.acquireLock('tx1', 'user1', { amount: '100' });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('already being processed');
  });

  it('should automatically expire lock after TTL', (done) => {
    manager.acquireLock('tx1', 'user1', { amount: '100' });
    
    setTimeout(() => {
      const result = manager.acquireLock('tx1', 'user1', { amount: '100' });
      expect(result.success).toBe(true); // Can acquire again
      done();
    }, 1100); // Wait for TTL
  });

  it('should enforce max locks per user', () => {
    const limitedManager = new TransactionLockManager({ maxLocks: 1 });
    
    limitedManager.acquireLock('tx1', 'user1', { amount: '100' });
    const result = limitedManager.acquireLock('tx2', 'user1', { amount: '200' });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum concurrent transactions');
  });
});
```

### Hook Tests

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useTransactionLock } from '../useTransactionLock';

describe('useTransactionLock', () => {
  it('should acquire lock on submit', async () => {
    const { result } = renderHook(() =>
      useTransactionLock({ userId: 'user1' })
    );

    let acquired: boolean;
    await act(async () => {
      acquired = await result.current.acquireLock('tx1', {});
    });

    expect(acquired).toBe(true);
    expect(result.current.isLocked).toBe(true);
  });

  it('should prevent duplicate submission', async () => {
    const { result } = renderHook(() =>
      useTransactionLock({ userId: 'user1' })
    );

    await act(async () => {
      await result.current.acquireLock('tx1', {});
    });

    let secondAttempt: boolean;
    await act(async () => {
      secondAttempt = await result.current.acquireLock('tx1', {});
    });

    expect(secondAttempt).toBe(false);
    expect(result.current.error).toBeDefined();
  });

  it('should release lock after successful submission', async () => {
    const { result } = renderHook(() =>
      useTransactionLock({ userId: 'user1' })
    );

    await act(async () => {
      await result.current.acquireLock('tx1', {});
    });

    act(() => {
      result.current.releaseLock();
    });

    expect(result.current.isLocked).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });
});
```

## Performance Metrics

- **Lock Acquisition**: <1ms
- **Memory Overhead**: ~1KB per active lock
- **Cleanup Interval**: Every 10 seconds (automatic)
- **Default TTL**: 30 seconds (configurable)

## Security Considerations

1. **Server-Side Validation**: Always validate on backend, client-side is UX enhancement
2. **Unique Transaction IDs**: Use robust ID generation (UUID, hash of transaction data)
3. **Appropriate TTL**: Set lock duration based on expected transaction processing time
4. **Error Handling**: Always release locks in try/finally blocks

## Troubleshooting

### Issue: User stuck unable to submit
**Solution**: Check lock TTL, ensure releaseLock() called in finally block

### Issue: Duplicates still occurring
**Solution**: Implement server-side lock validation, verify transaction ID uniqueness

### Issue: Lock not expiring
**Solution**: Check system clock, ensure cleanup interval is running

## Future Enhancements

1. **Persistent Locks**: Store locks in Redis for multi-server deployments
2. **Adaptive TTL**: Adjust lock duration based on transaction complexity
3. **Queue System**: Allow users to queue transactions instead of blocking
4. **Analytics**: Track duplicate attempt patterns

## Related Files

- `libs/ui-components/src/transaction-lock-manager.ts` - Core lock logic
- `libs/ui-components/src/hooks/useTransactionLock.ts` - React hook
- `apps/api/src/transactions/transactions.service.ts` - Server integration point
