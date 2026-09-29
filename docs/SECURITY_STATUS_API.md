# Security and Operational Documentation: Transaction Status API

## Overview

The Transaction Status API provides secure, documented status retrieval with stable states and chain references for cross-chain transactions. This document outlines security considerations, operational implications, and best practices for production deployment.

## API Endpoint

**Endpoint:** `GET /transactions/:id/status`

**Purpose:** Retrieve transaction status with stable, versioned states and chain reference information.

## Security Considerations

### Authentication and Authorization

The status endpoint leverages the existing `ApiSecurityGuard` for authentication:

- **Required:** Valid Bearer token in Authorization header
- **Public Routes:** The endpoint is not in the public route whitelist and requires authentication
- **Token Validation:** Tokens are validated for format and presence before processing requests

```typescript
// Security check is handled by ApiSecurityGuard
// Non-public routes require valid Bearer token
```

### Data Exposure

**Sensitive Data Handling:**
- Transaction hashes and block numbers are exposed only when explicitly requested via `includeChainDetails=true`
- Error messages are sanitized to prevent information leakage
- No private keys or sensitive authentication data is exposed

**Rate Limiting:**
- Protected by global rate limiting middleware (default: 100 requests per 15 minutes)
- Consider implementing stricter limits for status endpoints to prevent abuse

### Input Validation

**Parameter Validation:**
- Transaction ID format validation (UUID)
- Query parameter type checking (boolean flags)
- Chain ID validation against configured chains

**Sanitization:**
- All user inputs are sanitized through NestJS ValidationPipe
- SQL injection prevention via TypeORM parameterized queries

## Stable State Management

### State Versioning

The API uses versioned, stable states to ensure backward compatibility:

```typescript
export enum StableTransactionState {
  INITIALIZED = 'initialized',
  SUBMITTED = 'submitted',
  SOURCE_CONFIRMED = 'source_confirmed',
  DESTINATION_PROCESSING = 'destination_processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
  CANCELLED = 'cancelled',
}
```

**Versioning Policy:**
- States are considered stable and should not change without a major version bump
- Legacy `TransactionStatus` is included for backward compatibility
- State transitions follow a deterministic pattern

### State Mapping

The service maps legacy transaction statuses to stable states:

| Legacy Status | Current Step | Stable State |
|--------------|--------------|--------------|
| PENDING | 0 | INITIALIZED |
| PENDING | >0 | SUBMITTED |
| IN_PROGRESS | 0 | INITIALIZED |
| IN_PROGRESS | 1 | SUBMITTED |
| IN_PROGRESS | middle | SOURCE_CONFIRMED |
| IN_PROGRESS | final-1 | DESTINATION_PROCESSING |
| COMPLETED | any | COMPLETED |
| FAILED | any | FAILED |
| PARTIAL | any | PARTIAL |

## Chain Reference Security

### Chain Configuration

Chain references are built from validated chain configurations:

- Chains are loaded from `DynamicChainConfigLoader`
- Invalid chain IDs are rejected with appropriate error messages
- Explorer URLs are validated before inclusion

### URL Security

**Explorer URL Construction:**
- URLs are constructed using validated chain configurations
- Transaction hashes are validated before URL construction
- No user-supplied URLs are directly used

**Example:**
```typescript
// Safe URL construction
getTransactionExplorerUrl(chainId, txHash)
// Returns: https://stellar.expert/tx/abc123
```

## Operational Implications

### Performance Considerations

**Database Queries:**
- Single database query per status request
- Consider caching for frequently accessed transactions
- Index on `transaction.id` for optimal performance

**Chain Configuration Loading:**
- Chain configurations are loaded dynamically
- Consider implementing chain config caching for high-traffic scenarios

**Estimated Time Calculation:**
- Time estimates are calculated based on chain type and remaining steps
- In production, replace with historical data for accuracy

### Monitoring and Logging

**Security Events:**
- All authentication failures are logged via `ApiSecurityGuard`
- Invalid transaction ID attempts are logged
- Chain configuration mismatches are logged as warnings

**Operational Metrics:**
- Track status endpoint latency
- Monitor authentication failure rates
- Log chain reference construction failures

**Audit Logging:**
- Status queries are logged via `AuditLoggerService`
- Include transaction ID, user identity, and timestamp
- Consider logging for compliance requirements

### Error Handling

**Graceful Degradation:**
- Missing chain information returns `null` for chain references
- Invalid chain IDs don't break the entire response
- Service errors return appropriate HTTP status codes

**Error Messages:**
- Generic error messages for security (no sensitive data leakage)
- Detailed errors in logs for troubleshooting
- User-friendly messages in API responses

## Production Deployment Checklist

### Security

- [ ] Ensure `ApiSecurityGuard` is properly configured
- [ ] Review and adjust rate limiting for status endpoints
- [ ] Enable HTTPS/TLS for all API communications
- [ ] Implement API key rotation policies
- [ ] Set up monitoring for authentication failures
- [ ] Review chain configuration access controls

### Performance

- [ ] Add database indexes on transaction ID
- [ ] Implement caching for frequently accessed transactions
- [ ] Set up CDN for static chain configuration data
- [ ] Configure connection pooling for database
- [ ] Monitor endpoint latency and set up alerts

### Monitoring

- [ ] Set up logging for all status queries
- [ ] Configure alerts for high error rates
- [ ] Monitor chain configuration loading failures
- [ ] Track authentication success/failure rates
- [ ] Set up uptime monitoring for the endpoint

### Documentation

- [ ] Update API documentation with new endpoint
- [ ] Document stable state transitions
- [ ] Provide examples for different query parameters
- [ ] Create runbooks for common operational issues
- [ ] Document chain configuration management

## Rate Limiting Recommendations

**Default Configuration:**
- Window: 15 minutes
- Max Requests: 100 per window

**Status Endpoint Specific:**
- Consider: 50 requests per 15 minutes per authenticated user
- Burst allowance: 10 requests per minute
- Implement exponential backoff for rate-limited clients

## Caching Strategy

**Recommended Cache Configuration:**
- TTL: 30 seconds for active transactions
- TTL: 5 minutes for completed transactions
- Cache key: `status:{transactionId}:{queryParamsHash}`
- Invalidation: Update cache on transaction state changes

**Implementation Considerations:**
- Use Redis for distributed caching
- Implement cache warming for frequently accessed transactions
- Monitor cache hit/miss ratios

## Incident Response

### Common Issues

**High Authentication Failure Rate:**
1. Check API key configuration
2. Review rate limiting settings
3. Verify token validation logic
4. Check for brute force attacks

**Slow Response Times:**
1. Check database query performance
2. Review chain configuration loading
3. Verify caching is working
4. Check network latency to database

**Chain Configuration Errors:**
1. Verify chain configuration files
2. Check environment variable overrides
3. Review chain validation logic
4. Update chain configurations if needed

### Escalation Path

1. **Level 1:** Monitor and log (automated)
2. **Level 2:** On-call engineer response (alerts)
3. **Level 3:** Engineering team investigation (recurring issues)
4. **Level 4:** Security team (security incidents)

## Compliance Considerations

### Data Privacy

- Transaction hashes are considered public blockchain data
- No personal data is exposed in status responses
- Consider GDPR implications for transaction metadata

### Audit Trail

- All status queries are logged with timestamps
- User identity is tracked for authenticated requests
- Logs are retained according to data retention policies

### Regulatory Compliance

- Ensure status endpoint availability meets SLA requirements
- Document security measures for regulatory audits
- Implement appropriate data retention policies

## Future Enhancements

### Planned Improvements

1. **WebSocket Support:** Real-time status updates
2. **Batch Optimization:** More efficient batch status queries
3. **Historical Analytics:** Status transition analytics
4. **Advanced Filtering:** Filter by state, chain, time range
5. **Webhook Notifications:** Status change webhooks

### Security Enhancements

1. **Scope-Based Access:** Limit access to specific transactions
2. **Resource-Based Authorization:** Check ownership before status access
3. **Advanced Rate Limiting:** Per-user, per-endpoint rate limiting
4. **Request Signing:** Additional signature verification for sensitive operations

## Contact and Support

**Security Issues:** security@bridgewise.example.com
**Operational Issues:** ops@bridgewise.example.com
**Documentation:** docs@bridgewise.example.com

## Version History

- **v1.0.0** (2026-01-29): Initial release with stable states and chain references
