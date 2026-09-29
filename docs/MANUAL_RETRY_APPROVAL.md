# Manual Transaction Retry Approval

## Overview

The Manual Transaction Retry Approval system provides a controlled mechanism for operators to approve or reject retry requests for failed transactions. This ensures that sensitive or high-value transactions require explicit approval before retry, adding an additional layer of operational control.

## Implementation

The manual retry approval service is implemented in `apps/api/src/transactions/manual-retry-approval.service.ts` and provides:

- **Retry request submission**: Users can submit retry requests for failed transactions
- **Manual approval workflow**: Operators review and approve/reject requests
- **Audit trail**: Complete history of approval decisions
- **Pending request tracking**: View all pending approval requests

## Usage

### Service API

```typescript
import { ManualRetryApprovalService } from './transactions/manual-retry-approval.service';

// Submit a retry request
const request = {
  transactionId: 'tx-123',
  requester: 'user@example.com',
  reason: 'Network timeout - safe to retry'
};
approvalService.submitRetryRequest(request);

// Approve a retry request
approvalService.approveRetry('tx-123', 'operator@example.com');

// Reject a retry request
approvalService.rejectRetry('tx-123', 'operator@example.com', 'Invalid parameters');

// Check pending requests
const pending = approvalService.getPendingRequests();

// Get approval status
const status = approvalService.getApprovalStatus('tx-123');

// Check if request is pending
const isPending = approvalService.hasPendingRequest('tx-123');

// Get approval history
const history = approvalService.getApprovalHistory();
```

## Integration with Transaction Retry Service

The manual retry approval service integrates with the existing `TransactionRetryService` to add approval workflow:

```typescript
import { TransactionRetryService } from './transactions/retry/transaction-retry.service';
import { ManualRetryApprovalService } from './transactions/manual-retry-approval.service';

class EnhancedTransactionRetryService {
  constructor(
    private retryService: TransactionRetryService,
    private approvalService: ManualRetryApprovalService
  ) {}

  async requestRetry(transactionId: string, requester: string, reason: string) {
    // Submit approval request
    const submitted = this.approvalService.submitRetryRequest({
      transactionId,
      requester,
      reason
    });

    if (!submitted) {
      throw new Error('Retry request already pending or failed');
    }

    return { status: 'pending_approval' };
  }

  async executeApprovedRetry(transactionId: string, approver: string) {
    // Approve the retry
    const approved = this.approvalService.approveRetry(transactionId, approver);
    
    if (!approved) {
      throw new Error('No pending retry request to approve');
    }

    // Execute the retry
    const transaction = await this.getTransaction(transactionId);
    return this.retryService.retryTransaction(transaction);
  }
}
```

## Approval Workflow

### 1. Request Submission
- User or system submits retry request with transaction ID and reason
- Request is stored in pending approvals
- Requester is notified of submission

### 2. Operator Review
- Operators view pending requests via dashboard or API
- Each request includes transaction details and retry reason
- Operator can approve or reject with optional rejection reason

### 3. Approval/Rejection
- **Approval**: Transaction is queued for retry
- **Rejection**: Request is closed with rejection reason
- Decision is logged in approval history

### 4. Execution
- Approved transactions are retried
- Status updates are tracked
- Results are logged

## Configuration

### Environment Variables

```bash
# Enable manual approval for retry
MANUAL_RETRY_APPROVAL_ENABLED=true

# Require approval for transactions above threshold
MANUAL_RETRY_APPROVAL_AMOUNT_THRESHOLD=10000

# Auto-approve retry for certain error codes
MANUAL_RETRY_AUTO_APPROVE_CODES=timeout,network_error

# Approval timeout (auto-reject after time)
MANUAL_RETRY_APPROVAL_TIMEOUT_MS=3600000
```

### Service Configuration

```typescript
// In module configuration
{
  provide: ManualRetryApprovalService,
  useFactory: () => {
    const service = new ManualRetryApprovalService();
    // Configure based on environment
    return service;
  }
}
```

## API Endpoints

### Submit Retry Request
```
POST /api/transactions/retry/request
Body: {
  transactionId: string,
  requester: string,
  reason: string
}
Response: {
  success: boolean,
  message: string
}
```

### Approve Retry
```
POST /api/transactions/retry/approve
Body: {
  transactionId: string,
  approver: string
}
Response: {
  success: boolean,
  message: string
}
```

### Reject Retry
```
POST /api/transactions/retry/reject
Body: {
  transactionId: string,
  rejector: string,
  reason: string
}
Response: {
  success: boolean,
  message: string
}
```

### Get Pending Requests
```
GET /api/transactions/retry/pending
Response: RetryApprovalRequest[]
```

### Get Approval Status
```
GET /api/transactions/retry/status/:transactionId
Response: RetryApprovalStatus
```

## Security Considerations

### Authorization
- Only authorized operators can approve/reject requests
- Requester authentication required for submission
- Approver identity verification required

### Audit Trail
- All approval decisions are logged
- Timestamps and approver identities recorded
- Rejection reasons documented

### Rate Limiting
- Prevent spam of retry requests
- Limit requests per user per time period
- Require minimum time between requests

## Monitoring and Alerts

### Key Metrics
- Pending approval count
- Approval rate (approved vs rejected)
- Average approval time
- Rejection reasons distribution

### Alerts
- High pending approval count
- Unusual approval patterns
- Frequent rejections for same reason

## Best Practices

1. **Clear retry reasons**: Provide detailed justification for retry requests
2. **Prompt review**: Review pending requests regularly
3. **Document rejections**: Always provide rejection reasons
4. **Monitor patterns**: Track common rejection reasons to identify systemic issues
5. **Regular audits**: Review approval history for compliance

## Troubleshooting

### Request Not Submitting
- Check if request already pending for transaction
- Verify requester has permission
- Check service configuration

### Approval Not Working
- Verify pending request exists
- Check approver authorization
- Review service logs for errors

### High Pending Count
- Increase operator capacity
- Review approval criteria
- Consider auto-approval for safe cases

## References

- [Manual Retry Approval Service](../apps/api/src/transactions/manual-retry-approval.service.ts)
- [Transaction Retry Service](../apps/api/src/transactions/retry/transaction-retry.service.ts)
- [Recovery Queue Service](../apps/api/src/recovery/queue/stellar/transaction-recovery-queue.service.ts)

## Changelog

- 2026-09-28: Initial implementation and documentation
