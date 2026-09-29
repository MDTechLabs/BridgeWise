import { Injectable, Logger } from '@nestjs/common';

export interface RetryApprovalRequest {
  transactionId: string;
  requester: string;
  reason: string;
}

export interface RetryApprovalStatus {
  transactionId: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionReason?: string;
}

/**
 * Service for managing manual transaction retry approvals.
 * Allows operators to approve or reject retry requests for failed transactions.
 */
@Injectable()
export class ManualRetryApprovalService {
  private readonly logger = new Logger(ManualRetryApprovalService.name);
  private readonly pendingApprovals = new Map<string, RetryApprovalRequest>();
  private readonly approvalHistory = new Map<string, RetryApprovalStatus>();

  /**
   * Submit a retry request for manual approval.
   */
  submitRetryRequest(request: RetryApprovalRequest): boolean {
    if (this.pendingApprovals.has(request.transactionId)) {
      this.logger.warn(`Retry request already pending for transaction ${request.transactionId}`);
      return false;
    }

    this.pendingApprovals.set(request.transactionId, request);
    this.logger.log(`Retry request submitted for transaction ${request.transactionId} by ${request.requester}`);
    return true;
  }

  /**
   * Approve a retry request.
   */
  approveRetry(transactionId: string, approver: string): boolean {
    const request = this.pendingApprovals.get(transactionId);
    if (!request) {
      this.logger.warn(`No pending retry request for transaction ${transactionId}`);
      return false;
    }

    this.pendingApprovals.delete(transactionId);
    this.approvalHistory.set(transactionId, {
      transactionId,
      approved: true,
      approvedBy: approver,
      approvedAt: Date.now(),
    });

    this.logger.log(`Retry approved for transaction ${transactionId} by ${approver}`);
    return true;
  }

  /**
   * Reject a retry request.
   */
  rejectRetry(transactionId: string, rejector: string, reason: string): boolean {
    const request = this.pendingApprovals.get(transactionId);
    if (!request) {
      this.logger.warn(`No pending retry request for transaction ${transactionId}`);
      return false;
    }

    this.pendingApprovals.delete(transactionId);
    this.approvalHistory.set(transactionId, {
      transactionId,
      approved: false,
      rejectedBy: rejector,
      rejectedAt: Date.now(),
      rejectionReason: reason,
    });

    this.logger.log(`Retry rejected for transaction ${transactionId} by ${rejector}: ${reason}`);
    return true;
  }

  /**
   * Get pending retry requests.
   */
  getPendingRequests(): RetryApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Get approval status for a transaction.
   */
  getApprovalStatus(transactionId: string): RetryApprovalStatus | undefined {
    return this.approvalHistory.get(transactionId);
  }

  /**
   * Check if a transaction has a pending approval request.
   */
  hasPendingRequest(transactionId: string): boolean {
    return this.pendingApprovals.has(transactionId);
  }

  /**
   * Get all approval history.
   */
  getApprovalHistory(): RetryApprovalStatus[] {
    return Array.from(this.approvalHistory.values());
  }
}
