import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseTransactionLockOptions {
  userId: string;
  ttlMs?: number; // Lock duration (default: 30000ms)
  onLockAcquired?: (transactionId: string) => void;
  onLockReleased?: (transactionId: string) => void;
  onDuplicateDetected?: (existingLockId: string) => void;
}

export interface UseTransactionLockReturn {
  isLocked: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  activeLockId?: string;
  lockTimeRemaining: number;
  acquireLock: (transactionId: string, metadata: any) => Promise<boolean>;
  releaseLock: () => void;
  error?: string;
}

/**
 * React hook for preventing duplicate transaction submissions
 */
export function useTransactionLock(
  options: UseTransactionLockOptions
): UseTransactionLockReturn {
  const {
    userId,
    ttlMs = 30000,
    onLockAcquired,
    onLockReleased,
    onDuplicateDetected,
  } = options;

  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLockId, setActiveLockId] = useState<string | undefined>();
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const lockManagerRef = useRef<any>(null);
  const cleanupIntervalRef = useRef<NodeJS.Timeout>();

  // Initialize lock manager (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Simple in-memory lock storage for client-side
    lockManagerRef.current = {
      locks: new Map<string, { expiresAt: number; metadata: any }>(),
      acquire: (transactionId: string, metadata: any, ttl: number) => {
        const existing = lockManagerRef.current.locks.get(transactionId);
        
        // Check for existing valid lock
        if (existing && Date.now() < existing.expiresAt) {
          return {
            success: false,
            error: 'Transaction is already being processed',
          };
        }

        // Create new lock
        const now = Date.now();
        lockManagerRef.current.locks.set(transactionId, {
          expiresAt: now + ttl,
          metadata,
        });

        return { success: true };
      },
      release: (transactionId: string) => {
        return lockManagerRef.current.locks.delete(transactionId);
      },
      isLocked: (transactionId: string) => {
        const existing = lockManagerRef.current.locks.get(transactionId);
        if (!existing) {
          return false;
        }
        
        if (Date.now() >= existing.expiresAt) {
          lockManagerRef.current.locks.delete(transactionId);
          return false;
        }
        
        return true;
      },
      getTimeRemaining: (transactionId: string) => {
        const existing = lockManagerRef.current.locks.get(transactionId);
        if (!existing) {
          return 0;
        }
        return Math.max(0, existing.expiresAt - Date.now());
      },
      clear: () => {
        lockManagerRef.current.locks.clear();
      },
    };

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  // Update lock time remaining countdown
  useEffect(() => {
    if (!isLocked || !activeLockId) {
      return;
    }

    const updateCountdown = () => {
      const remaining = lockManagerRef.current?.getTimeRemaining(activeLockId) || 0;
      setLockTimeRemaining(remaining);

      if (remaining <= 0) {
        setIsLocked(false);
        setActiveLockId(undefined);
        setError(undefined);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);
    cleanupIntervalRef.current = interval;

    return () => clearInterval(interval);
  }, [isLocked, activeLockId]);

  /**
   * Acquire lock for transaction submission
   */
  const acquireLock = useCallback(async (
    transactionId: string,
    metadata: any
  ): Promise<boolean> => {
    if (!lockManagerRef.current) {
      setError('Lock manager not initialized');
      return false;
    }

    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = lockManagerRef.current.acquire(transactionId, metadata, ttlMs);

      if (result.success) {
        setIsLocked(true);
        setActiveLockId(transactionId);
        setLockTimeRemaining(ttlMs);
        onLockAcquired?.(transactionId);
        return true;
      } else {
        setError(result.error);
        onDuplicateDetected?.(transactionId);
        return false;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [ttlMs, onLockAcquired, onDuplicateDetected]);

  /**
   * Release the current lock
   */
  const releaseLock = useCallback(() => {
    if (!activeLockId || !lockManagerRef.current) {
      return;
    }

    lockManagerRef.current.release(activeLockId);
    setIsLocked(false);
    setActiveLockId(undefined);
    setLockTimeRemaining(0);
    setError(undefined);
    onLockReleased?.(activeLockId);
  }, [activeLockId, onLockReleased]);

  // Determine if user can submit
  const canSubmit = !isLocked && !isSubmitting;

  return {
    isLocked,
    isSubmitting,
    canSubmit,
    activeLockId,
    lockTimeRemaining,
    acquireLock,
    releaseLock,
    error,
  };
}
