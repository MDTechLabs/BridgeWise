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
      metadata: {
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        amount: this.sanitizeAmount(data.amount),
        selectedAdapter: data.selectedAdapter,
        routeScore: data.routeScore,
        alternativeCount: data.alternativeCount,
      },
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
      metadata: {
        transactionId: data.transactionId,
        adapter: data.adapter,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        status: data.status,
        executionTimeMs: data.executionTimeMs,
      },
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
      metadata: {
        transactionId: data.transactionId,
        type: data.type,
        totalSteps: data.totalSteps,
      },
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
      metadata: {
        transactionId: data.transactionId,
        previousStatus: data.previousStatus,
        newStatus: data.newStatus,
        currentStep: data.currentStep,
      },
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
      metadata: {
        adapter: data.adapter,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        estimatedFee: this.sanitizeAmount(data.estimatedFee),
        responseTimeMs: data.responseTimeMs,
      },
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
      metadata: {
        transactionId: data.transactionId,
        adapter: data.adapter,
        txHash: data.txHash ? this.sanitizeTxHash(data.txHash) : undefined,
        status: data.status,
        errorCode: data.errorCode,
      },
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
}
