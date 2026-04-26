import { Injectable, Logger } from '@nestjs/common';

export enum AuditEventType {
  ROUTE_SELECTION = 'ROUTE_SELECTION',
  ROUTE_EXECUTION = 'ROUTE_EXECUTION',
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  TRANSACTION_UPDATED = 'TRANSACTION_UPDATED',
  FEE_ESTIMATION = 'FEE_ESTIMATION',
  BRIDGE_TRANSFER = 'BRIDGE_TRANSFER',
}

export interface AuditLogEntry {
  eventType: AuditEventType;
  timestamp: string;
  requestId?: string;
  userId?: string;
  metadata: Record<string, any>;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger('AuditLogger');
  private readonly secretPatterns = [
    /api[_-]?key/i,
    /api[_-]?secret/i,
    /password/i,
    /token/i,
    /private[_-]?key/i,
    /secret/i,
    /auth[_-]?token/i,
    /bearer/i,
    /credential/i,
  ];

  logRouteSelection(data: {
    requestId?: string;
    sourceChain: string;
    destinationChain: string;
    amount: string;
    selectedAdapter: string;
    routeScore?: number;
    alternativeCount?: number;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.ROUTE_SELECTION,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        amount: this.sanitizeAmount(data.amount),
        selectedAdapter: data.selectedAdapter,
        routeScore: data.routeScore,
        alternativeCount: data.alternativeCount,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  logRouteExecution(data: {
    requestId?: string;
    transactionId: string;
    adapter: string;
    sourceChain: string;
    destinationChain: string;
    status: string;
    executionTimeMs?: number;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.ROUTE_EXECUTION,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        transactionId: data.transactionId,
        adapter: data.adapter,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        status: data.status,
        executionTimeMs: data.executionTimeMs,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  logTransactionCreated(data: {
    requestId?: string;
    transactionId: string;
    type: string;
    totalSteps: number;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.TRANSACTION_CREATED,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        transactionId: data.transactionId,
        type: data.type,
        totalSteps: data.totalSteps,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  logTransactionUpdated(data: {
    requestId?: string;
    transactionId: string;
    previousStatus: string;
    newStatus: string;
    currentStep?: number;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.TRANSACTION_UPDATED,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        transactionId: data.transactionId,
        previousStatus: data.previousStatus,
        newStatus: data.newStatus,
        currentStep: data.currentStep,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  logFeeEstimation(data: {
    requestId?: string;
    adapter: string;
    sourceChain: string;
    destinationChain: string;
    estimatedFee: string;
    responseTimeMs?: number;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.FEE_ESTIMATION,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        adapter: data.adapter,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        estimatedFee: this.sanitizeAmount(data.estimatedFee),
        responseTimeMs: data.responseTimeMs,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  logBridgeTransfer(data: {
    requestId?: string;
    transactionId: string;
    adapter: string;
    txHash?: string;
    status: 'initiated' | 'confirmed' | 'failed';
    errorCode?: string;
  }): void {
    const entry: AuditLogEntry = {
      eventType: AuditEventType.BRIDGE_TRANSFER,
      timestamp: new Date().toISOString(),
      requestId: data.requestId,
      metadata: this.sanitizeMetadata({
        transactionId: data.transactionId,
        adapter: data.adapter,
        txHash: data.txHash ? this.sanitizeTxHash(data.txHash) : undefined,
        status: data.status,
        errorCode: data.errorCode,
      }),
    };
    this.logger.log(JSON.stringify(entry));
  }

  private sanitizeAmount(amount: string): string {
    // Only log first 4 and last 4 characters for large amounts
    if (amount.length > 12) {
      return `${amount.slice(0, 4)}...${amount.slice(-4)}`;
    }
    return amount;
  }

  private sanitizeTxHash(hash: string): string {
    // Only log first 8 and last 8 characters of transaction hash
    if (hash.length > 20) {
      return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
    }
    return hash;
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // Check if key matches secret patterns
      const isSecretKey = this.secretPatterns.some(pattern => pattern.test(key));
      
      if (isSecretKey) {
        // Redact secret values
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 0) {
        // Check if value looks like a secret (long hex strings, etc.)
        if (this.looksLikeSecret(value)) {
          sanitized[key] = this.redactSensitiveValue(value);
        } else {
          sanitized[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private looksLikeSecret(value: string): boolean {
    // Check for common secret patterns
    const hexPattern = /^[a-f0-9]{32,}$/i; // 32+ char hex strings (likely keys)
    const bearerPattern = /^bearer\s+/i;
    const basicPattern = /^basic\s+/i;
    
    return hexPattern.test(value) || 
           bearerPattern.test(value) || 
           basicPattern.test(value);
  }

  private redactSensitiveValue(value: string): string {
    if (value.length <= 8) {
      return '[REDACTED]';
    }
    // Show first 4 and last 4 characters
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
}
