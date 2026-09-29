# Operational Runbook: Transaction Status API

## Purpose

This runbook provides step-by-step procedures for operating, troubleshooting, and maintaining the Transaction Status API endpoint (`GET /transactions/:id/status`).

## System Overview

**Endpoint:** `GET /transactions/:id/status`
**Service:** `TransactionsStatusService`
**Controller:** `TransactionsController`
**Module:** `TransactionsModule`

## Pre-Deployment Checklist

### Configuration Verification

- [ ] Verify `ApiSecurityGuard` is enabled in AppModule
- [ ] Check chain configuration files are valid
- [ ] Ensure database connection is configured
- [ ] Verify rate limiting middleware is active
- [ ] Check logging configuration is set up
- [ ] Ensure audit logging service is available

### Database Preparation

- [ ] Run database migrations
- [ ] Verify `transactions` table exists
- [ ] Check indexes on `id` column
- [ ] Verify database connection pool settings
- [ ] Test database query performance

### Monitoring Setup

- [ ] Configure application performance monitoring
- [ ] Set up log aggregation
- [ ] Configure alerting for error rates
- [ ] Set up uptime monitoring
- [ ] Configure dashboard for key metrics

## Operational Procedures

### Starting the Service

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

**Health Check:**
```bash
curl http://localhost:3000/health
```

### Status Verification

**Manual Test:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/transactions/txn_123/status
```

**Expected Response:**
```json
{
  "id": "txn_123",
  "type": "stellar-payment",
  "state": "submitted",
  "status": "in_progress",
  "currentStep": 1,
  "totalSteps": 3,
  "sourceChain": {
    "chainId": "stellar",
    "chainName": "Stellar Mainnet",
    "chainNumber": 1,
    "chainType": "Stellar"
  },
  "retryCount": 0,
  "maxRetries": 3,
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:01:00.000Z"
}
```

## Troubleshooting Guide

### Issue: 401 Unauthorized

**Symptoms:**
- API returns 401 status code
- "Missing authorization header" or "Invalid authorization scheme" error

**Root Causes:**
1. Missing Authorization header
2. Invalid token format
3. Expired or invalid token

**Resolution Steps:**
1. Verify Authorization header is present
2. Check token format: `Bearer <token>`
3. Validate token with API key vault
4. Check token expiration

**Commands:**
```bash
# Check headers
curl -v -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/transactions/txn_123/status

# Verify token format
echo "YOUR_TOKEN" | base64 -d
```

### Issue: 404 Transaction Not Found

**Symptoms:**
- API returns 404 status code
- "Transaction not found" error message

**Root Causes:**
1. Invalid transaction ID
2. Transaction deleted from database
3. Database connection issue

**Resolution Steps:**
1. Verify transaction ID format (UUID)
2. Check database for transaction existence
3. Verify database connectivity
4. Check application logs for database errors

**Commands:**
```bash
# Check database
psql -d bridgewise -c "SELECT * FROM transactions WHERE id = 'txn_123';"

# Verify UUID format
echo "txn_123" | grep -E '^[a-f0-9-]{36}$'
```

### Issue: 500 Internal Server Error

**Symptoms:**
- API returns 500 status code
- Generic error message
- Application logs show stack trace

**Root Causes:**
1. Chain configuration loading failure
2. Database query error
3. Service initialization failure
4. Memory/CPU exhaustion

**Resolution Steps:**
1. Check application logs for detailed error
2. Verify chain configuration files
3. Test database connectivity
4. Check system resources (memory, CPU)
5. Restart service if needed

**Commands:**
```bash
# Check logs
tail -f logs/application.log

# Check system resources
top
free -m

# Restart service
pm2 restart api
```

### Issue: Slow Response Times

**Symptoms:**
- API responses take > 2 seconds
- Timeouts in client applications
- High latency in monitoring

**Root Causes:**
1. Missing database indexes
2. Inefficient database queries
3. Network latency
4. High server load

**Resolution Steps:**
1. Check database query performance
2. Verify indexes on transaction ID
3. Check network latency
4. Review server load
5. Consider implementing caching

**Commands:**
```bash
# Check database query performance
psql -d bridgewise -c "EXPLAIN ANALYZE SELECT * FROM transactions WHERE id = 'txn_123';"

# Check network latency
ping database-host
```

### Issue: Chain Configuration Errors

**Symptoms:**
- Chain references return null
- Warnings in logs about invalid chain IDs
- Missing explorer URLs

**Root Causes:**
1. Invalid chain configuration files
2. Missing chain definitions
3. Environment variable overrides
4. Chain ID mismatch

**Resolution Steps:**
1. Verify chain configuration files exist
2. Validate chain configuration JSON
3. Check environment variable overrides
4. Verify chain IDs match metadata
5. Reload chain configurations

**Commands:**
```bash
# Validate chain configuration
cat config/chains.json | jq .

# Check environment variables
env | grep CHAIN

# Restart to reload configurations
pm2 restart api
```

## Performance Tuning

### Database Optimization

**Add Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_transactions_id ON transactions(id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
```

**Connection Pooling:**
```typescript
// In TypeORM configuration
{
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  extra: {
    max: 20, // Maximum pool size
    min: 5,  // Minimum pool size
    idleTimeoutMillis: 30000
  }
}
```

### Caching Strategy

**Redis Configuration:**
```typescript
// Cache status responses
const cacheKey = `status:${transactionId}:${queryParamsHash}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const status = await service.getStatus(id, query);
await redis.setex(cacheKey, 30, JSON.stringify(status)); // 30 second TTL
```

**Cache Invalidation:**
```typescript
// Invalidate cache on transaction update
await redis.del(`status:${transactionId}:*`);
```

## Monitoring and Alerting

### Key Metrics

**Performance Metrics:**
- Response time (p50, p95, p99)
- Request rate
- Error rate
- Database query time

**Security Metrics:**
- Authentication failure rate
- Invalid token attempts
- Rate limit violations
- Unauthorized access attempts

**Business Metrics:**
- Status query volume
- Active transaction count
- Chain reference success rate
- Time estimate accuracy

### Alert Thresholds

**Performance Alerts:**
- Response time > 2s (warning)
- Response time > 5s (critical)
- Error rate > 1% (warning)
- Error rate > 5% (critical)

**Security Alerts:**
- Auth failure rate > 10% (warning)
- Auth failure rate > 25% (critical)
- Rate limit violations > 100/hour (warning)

**Availability Alerts:**
- Endpoint down > 1 minute (warning)
- Endpoint down > 5 minutes (critical)

### Dashboard Configuration

**Recommended Panels:**
1. Request rate over time
2. Response time percentiles
3. Error rate by type
4. Authentication success rate
5. Database query performance
6. Cache hit/miss ratio
7. Active transactions by state

## Backup and Recovery

### Database Backup

**Automated Backups:**
```bash
# Daily backup
pg_dump -d bridgewise -f backup_$(date +%Y%m%d).sql

# Verify backup
pg_restore -l backup_20260129.sql
```

**Recovery Procedure:**
1. Stop application service
2. Restore database from backup
3. Verify data integrity
4. Restart application service
5. Run health checks

### Configuration Backup

**Chain Configuration:**
```bash
# Backup chain configurations
cp config/chains.json config/chains.json.backup
cp .env .env.backup
```

## Maintenance Procedures

### Regular Maintenance

**Daily:**
- Review error logs
- Check performance metrics
- Verify alert thresholds

**Weekly:**
- Review authentication logs
- Check rate limit effectiveness
- Analyze slow queries

**Monthly:**
- Review and update chain configurations
- Analyze performance trends
- Update documentation
- Review security policies

### Configuration Updates

**Chain Configuration Updates:**
1. Test new configuration in staging
2. Validate JSON format
3. Update configuration files
4. Restart service gracefully
5. Verify chain references work

**Service Updates:**
1. Deploy to staging environment
2. Run comprehensive tests
3. Monitor for errors
4. Deploy to production (blue-green deployment)
5. Monitor rollback plan

## Rollback Procedures

### Service Rollback

**If Issues Detected:**
1. Identify problematic version
2. Stop current deployment
3. Restore previous version
4. Verify service health
5. Monitor for issues

**Commands:**
```bash
# Using PM2
pm2 stop api
pm2 revert api
pm2 start api

# Verify health
curl http://localhost:3000/health
```

### Database Rollback

**If Data Issues:**
1. Stop application service
2. Restore database from backup
3. Verify data integrity
4. Restart application service
5. Run health checks

## Security Incident Response

### Unauthorized Access

**If Unauthorized Access Detected:**
1. Immediately revoke compromised API keys
2. Review authentication logs
3. Identify affected transactions
4. Notify security team
5. Implement additional monitoring

### Data Exposure

**If Data Exposure Suspected:**
1. Identify exposed data scope
2. Review access logs
3. Notify affected parties
4. Implement additional controls
5. Document incident for compliance

## Contact Information

**On-Call Engineer:** oncall@bridgewise.example.com
**Security Team:** security@bridgewise.example.com
**DevOps Team:** devops@bridgewise.example.com

## Appendix

### Useful Commands

**Check Service Status:**
```bash
pm2 status
pm2 logs api --lines 100
```

**Database Operations:**
```bash
# Connect to database
psql -d bridgewise

# Check transaction count
SELECT COUNT(*) FROM transactions;

# Check recent transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;
```

**Log Analysis:**
```bash
# Search for errors
grep "ERROR" logs/application.log

# Search for transaction status queries
grep "GET /transactions" logs/application.log

# Count authentication failures
grep "Unauthorized" logs/application.log | wc -l
```

### Configuration Files

**Main Configuration:**
- `apps/api/src/config/chains.config.ts` - Chain configuration
- `apps/api/src/config/config.service.ts` - General configuration
- `.env` - Environment variables

**Security Configuration:**
- `apps/api/src/security/api-security.guard.ts` - Security guard
- `apps/api/src/security/api-key-vault.service.ts` - API key management

**Service Configuration:**
- `apps/api/src/transactions/transactions-status.service.ts` - Status service
- `apps/api/src/transactions/transactions.controller.ts` - API controller

## Version History

- **v1.0.0** (2026-01-29): Initial operational runbook
