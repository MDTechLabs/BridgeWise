/**
 * Transaction Lock Manager
 * Prevents duplicate transaction submissions by tracking pending transactions
 */

export interface TransactionLock {
  id: string;
  timestamp: number;
  expiresAt: number;
  metadata: {
    sourceChain: string;
    destinationChain: string;
    amount: string;
    userAddress?: string;
  };
}

export interface LockOptions {
  ttlMs?: number; // Time-to-live in milliseconds (default: 30 seconds)
  maxLocks?: number; // Maximum concurrent locks per user (default: 1)
}

export class TransactionLockManager {
  private locks: Map<string, TransactionLock> = new Map();
  private userLocks: Map<string, Set<string>> = new Map(); // userId -> lockIds
  private readonly defaultTtlMs: number;
  private readonly maxLocksPerUser: number;

  constructor(options: LockOptions = {}) {
    this.defaultTtlMs = options.ttlMs ?? 30000; // 30 seconds default
    this.maxLocksPerUser = options.maxLocks ?? 1;
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Attempt to acquire a lock for a transaction
   * Returns true if lock acquired, false if duplicate detected
   */
  acquireLock(
    transactionId: string,
    userId: string,
    metadata: TransactionLock['metadata'],
    ttlMs?: number
  ): { success: boolean; error?: string; lock?: TransactionLock } {
    // Check if transaction already has a lock
    if (this.locks.has(transactionId)) {
      const existingLock = this.locks.get(transactionId)!;
      
      // Check if lock is still valid
      if (Date.now() < existingLock.expiresAt) {
        return {
          success: false,
          error: 'Transaction is already being processed',
        };
      }
      
      // Lock expired, remove it
      this.removeLock(transactionId);
    }

    // Check user's concurrent lock limit
    const userLockSet = this.userLocks.get(userId) || new Set();
    if (userLockSet.size >= this.maxLocksPerUser) {
      // Clean up any expired locks first
      this.cleanExpiredUserLocks(userId);
      
      // Check again after cleanup
      const updatedUserLockSet = this.userLocks.get(userId) || new Set();
      if (updatedUserLockSet.size >= this.maxLocksPerUser) {
        return {
          success: false,
          error: `Maximum concurrent transactions limit reached (${this.maxLocksPerUser})`,
        };
      }
    }

    // Create new lock
    const now = Date.now();
    const lock: TransactionLock = {
      id: transactionId,
      timestamp: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      metadata,
    };

    // Store lock
    this.locks.set(transactionId, lock);
    
    // Track user's locks
    if (!this.userLocks.has(userId)) {
      this.userLocks.set(userId, new Set());
    }
    this.userLocks.get(userId)!.add(transactionId);

    return {
      success: true,
      lock,
    };
  }

  /**
   * Release a lock manually (after successful submission)
   */
  releaseLock(transactionId: string): boolean {
    return this.removeLock(transactionId);
  }

  /**
   * Check if a transaction is locked
   */
  isLocked(transactionId: string): boolean {
    const lock = this.locks.get(transactionId);
    if (!lock) {
      return false;
    }

    // Check if lock is expired
    if (Date.now() >= lock.expiresAt) {
      this.removeLock(transactionId);
      return false;
    }

    return true;
  }

  /**
   * Get lock details
   */
  getLock(transactionId: string): TransactionLock | undefined {
    return this.locks.get(transactionId);
  }

  /**
   * Get all active locks for a user
   */
  getUserLocks(userId: string): TransactionLock[] {
    const lockIds = this.userLocks.get(userId) || new Set();
    const locks: TransactionLock[] = [];

    lockIds.forEach(lockId => {
      const lock = this.locks.get(lockId);
      if (lock && Date.now() < lock.expiresAt) {
        locks.push(lock);
      }
    });

    return locks;
  }

  /**
   * Check if user can submit a new transaction
   */
  canUserSubmit(userId: string): boolean {
    const userLockSet = this.userLocks.get(userId) || new Set();
    
    // Clean up expired locks
    this.cleanExpiredUserLocks(userId);
    
    // Check updated count
    const updatedUserLockSet = this.userLocks.get(userId) || new Set();
    return updatedUserLockSet.size < this.maxLocksPerUser;
  }

  /**
   * Get time remaining on a lock
   */
  getLockTimeRemaining(transactionId: string): number {
    const lock = this.locks.get(transactionId);
    if (!lock) {
      return 0;
    }

    const remaining = lock.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Clear all locks (useful for testing)
   */
  clear(): void {
    this.locks.clear();
    this.userLocks.clear();
  }

  /**
   * Remove a specific lock
   */
  private removeLock(transactionId: string): boolean {
    const lock = this.locks.get(transactionId);
    if (!lock) {
      return false;
    }

    // Remove from main locks map
    this.locks.delete(transactionId);

    // Remove from user's locks
    const userId = this.getUserIdForLock(transactionId);
    if (userId) {
      const userLockSet = this.userLocks.get(userId);
      if (userLockSet) {
        userLockSet.delete(transactionId);
        if (userLockSet.size === 0) {
          this.userLocks.delete(userId);
        }
      }
    }

    return true;
  }

  /**
   * Get user ID associated with a lock
   */
  private getUserIdForLock(transactionId: string): string | null {
    for (const [userId, lockIds] of this.userLocks.entries()) {
      if (lockIds.has(transactionId)) {
        return userId;
      }
    }
    return null;
  }

  /**
   * Clean up expired locks for a specific user
   */
  private cleanExpiredUserLocks(userId: string): void {
    const userLockSet = this.userLocks.get(userId);
    if (!userLockSet) {
      return;
    }

    const toRemove: string[] = [];
    userLockSet.forEach(lockId => {
      const lock = this.locks.get(lockId);
      if (!lock || Date.now() >= lock.expiresAt) {
        toRemove.push(lockId);
      }
    });

    toRemove.forEach(lockId => {
      userLockSet.delete(lockId);
      this.locks.delete(lockId);
    });

    if (userLockSet.size === 0) {
      this.userLocks.delete(userId);
    }
  }

  /**
   * Periodic cleanup of expired locks
   */
  private startCleanupInterval(): void {
    // Run cleanup every 10 seconds
    setInterval(() => {
      this.cleanupAllExpiredLocks();
    }, 10000);
  }

  /**
   * Clean up all expired locks
   */
  private cleanupAllExpiredLocks(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    this.locks.forEach((lock, id) => {
      if (now >= lock.expiresAt) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => {
      this.removeLock(id);
    });
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalActiveLocks: number;
    totalUsersWithLocks: number;
    averageLocksPerUser: number;
  } {
    const totalActiveLocks = Array.from(this.locks.values()).filter(
      lock => Date.now() < lock.expiresAt
    ).length;

    const usersWithLocks = new Set<string>();
    this.userLocks.forEach(lockIds => {
      lockIds.forEach(lockId => {
        const lock = this.locks.get(lockId);
        if (lock && Date.now() < lock.expiresAt) {
          usersWithLocks.add('user');
        }
      });
    });

    return {
      totalActiveLocks,
      totalUsersWithLocks: usersWithLocks.size,
      averageLocksPerUser: usersWithLocks.size > 0 ? totalActiveLocks / usersWithLocks.size : 0,
    };
  }
}
