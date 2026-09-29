# Emergency Liquidity Procedures

## Overview

This document outlines the procedures for handling emergency liquidity situations in the BridgeWise protocol. Emergency liquidity events may include bridge fund depletion, unusual withdrawal patterns, or cross-chain liquidity imbalances that require immediate intervention.

## Scope

- Emergency fund withdrawal protocols
- Liquidity rebalancing procedures
- Treasury emergency operations
- Guardian/Multisig activation for liquidity emergencies
- Post-emergency audit and recovery

## Emergency Response Levels

### Level 1: Automated Response (No Manual Intervention)
- **Trigger**: Minor liquidity imbalance (< 5% deviation)
- **Action**: Automatic rebalancing via existing bridge routes
- **Approval**: None (automated)
- **Timeline**: Immediate

### Level 2: Guardian Approval Required
- **Trigger**: Moderate liquidity imbalance (5-20% deviation)
- **Action**: Manual liquidity injection via multisig
- **Approval**: Single guardian signature
- **Timeline**: Within 1 hour

### Level 3: Full Multisig Emergency
- **Trigger**: Severe liquidity imbalance (> 20% deviation) or bridge fund depletion
- **Action**: Emergency treasury withdrawal and fund injection
- **Approval**: M-of-N multisig (as configured in governance)
- **Timeline**: Within 4 hours

## Emergency Fund Withdrawal Procedures

### Prerequisites
1. Verify liquidity deficit on affected chain
2. Confirm anomaly is not a temporary network issue
3. Check treasury fund availability
4. Notify all guardians/multisig owners

### Level 2 Procedure (Guardian Approval)

1. **Assessment**
   - Check current bridge liquidity: `GET /api/liquidity/status`
   - Identify deficit amount and target chain
   - Review recent withdrawal patterns for anomalies

2. **Guardian Approval**
   - Guardian creates liquidity injection proposal
   - Single signature required for amounts under threshold
   - Record decision in audit log

3. **Execution**
   - Submit treasury withdrawal via `TimelockExecutionService`
   - Use category: `'EMERGENCY'` for expedited processing
   - Target: Bridge contract on affected chain
   - Payload: `{ amount, chainId, reason }`

4. **Verification**
   - Confirm fund arrival on bridge contract
   - Update liquidity monitoring dashboards
   - Document intervention in incident log

### Level 3 Procedure (Full Multisig)

1. **Emergency Declaration**
   - Convene emergency multisig meeting
   - Document emergency trigger and required amount
   - Set emergency operation in `TimelockExecutionService`

2. **Multisig Approval**
   - Propose operation via `MultiSigControlService`
   - Required threshold: M-of-N signatures
   - Use operation name: `'EMERGENCY_LIQUIDITY_INJECTION'`
   - Include: `{ targetChain, amount, justification }`

3. **Expedited Timelock**
   - For true emergencies, use minimum timelock delay
   - Configure via `TimelockExecutionService` with category `'EMERGENCY'`
   - Typical delay: 1-2 hours (vs standard 24h)

4. **Execution**
   - Execute after timelock expires
   - Monitor fund transfer across chains
   - Verify bridge liquidity restoration

5. **Post-Execution**
   - Notify all stakeholders
   - Update governance records
   - Schedule post-incident review

## Liquidity Rebalancing Procedures

### Automated Rebalancing
- Use existing bridge routing for minor imbalances
- Leverage arbitrage opportunities when available
- Monitor gas costs vs rebalancing benefit

### Manual Rebalancing
1. Identify source chain with excess liquidity
2. Calculate optimal transfer amount
3. Execute cross-chain transfer via bridge
4. Verify receipt on destination chain
5. Update liquidity metrics

## Treasury Emergency Operations

### Emergency Categories
The `TimelockExecutionService` supports the following categories:
- `'EMERGENCY'` - For urgent liquidity interventions
- `'TREASURY'` - Standard treasury operations
- `'UPGRADE'` - Contract upgrades
- `'PARAMETER_CHANGE'` - Protocol parameter updates
- `'ALLOWLIST'` - Allowlist modifications

### Emergency Operation Flow

```typescript
// Example: Emergency liquidity injection
const timelock = new TimelockExecutionService({
  minDelayMs: 3600000, // 1 hour for emergencies
  maxDelayMs: 7200000, // 2 hours max
  gracePeriodMs: 86400000 // 24 hours grace
});

const result = timelock.queueOperation(
  'EMERGENCY',
  '0xBridgeContractAddress',
  {
    amount: '1000000',
    chainId: 'ethereum',
    reason: 'Liquidity emergency - Level 3'
  },
  '0xGuardianAddress',
  3600000 // 1 hour delay
);
```

## Guardian/Multisig Activation

### Guardian Responsibilities
- Monitor liquidity alerts 24/7
- Approve Level 2 emergency interventions
- Participate in Level 3 multisig decisions
- Document all emergency actions

### Multisig Requirements
- Minimum threshold: as configured in `MultiSigControlService`
- All owners must be reachable during emergencies
- Fallback contact procedures for unavailable owners
- Emergency contact list maintained off-chain

## Monitoring and Alerts

### Key Metrics to Monitor
- Bridge liquidity per chain (real-time)
- Treasury fund balance
- Withdrawal velocity
- Cross-chain transfer success rate
- Gas cost trends

### Alert Thresholds
- Liquidity < 20% of bridge capacity: WARNING
- Liquidity < 10% of bridge capacity: CRITICAL
- Withdrawal spike > 3x normal: INVESTIGATE
- Treasury fund < 30% of total bridge value: REVIEW

## Post-Emergency Procedures

### Immediate Actions
1. Verify liquidity restoration
2. Confirm bridge operations normal
3. Update monitoring dashboards
4. Notify all stakeholders

### Documentation
1. Incident report with timeline
2. Root cause analysis
3. Actions taken and justification
4. Signatures/approvals recorded
5. Audit log entries

### Review and Improvement
1. Post-incident review meeting
2. Update procedures if needed
3. Review monitoring thresholds
4. Test emergency response procedures
5. Update guardian/multisig contact list

## Security Considerations

### Authorization
- Only authorized guardians can approve Level 2 emergencies
- Multisig threshold must be met for Level 3
- All actions require cryptographic signatures
- Audit trail immutable on-chain

### Fraud Prevention
- Verify liquidity deficit before intervention
- Cross-check withdrawal patterns
- Require justification for all emergency actions
- Post-emergency audit mandatory

### Key Management
- Guardian keys stored securely (HSM or equivalent)
- Multisig owner keys distributed geographically
- Emergency key recovery procedures documented
- Regular key rotation schedule

## Testing and Drills

### Recommended Frequency
- Quarterly emergency response drills
- Annual full multisig emergency simulation
- Monthly guardian availability check

### Drill Scenarios
1. Simulated bridge fund depletion
2. Unusual withdrawal pattern detection
3. Multisig owner unavailability during emergency
4. Network congestion during emergency transfer

## Configuration

### Environment Variables
```bash
# Emergency liquidity thresholds
EMERGENCY_LIQUIDITY_THRESHOLD_PERCENT=20
CRITICAL_LIQUIDITY_THRESHOLD_PERCENT=10

# Guardian configuration
GUARDIAN_ADDRESSES=0x...,0x...
GUARDIAN_MIN_SIGNATURES=1

# Multisig configuration
MULTISIG_OWNERS=0x...,0x...,0x...
MULTISIG_THRESHOLD=2

# Timelock configuration (emergency)
EMERGENCY_TIMELOCK_MIN_DELAY_MS=3600000
EMERGENCY_TIMELOCK_MAX_DELAY_MS=7200000
```

## References

- [Timelock Execution Service](../src/governance/timelock/timelock-execution.service.ts)
- [Multisig Control Service](../src/governance/multisig/multisig-control.service.ts)
- [Operational Runbook](SERVICE_OBJECTIVES_AND_INCIDENT_RESPONSE.md)
- [Key Management Runbook](KEY_MANAGEMENT_RUNBOOK.md)

## Appendix: Emergency Contact Information

*This section should be populated with actual contact information for guardians and multisig owners in production deployments.*

- Primary Guardian: [Name] - [Contact]
- Backup Guardian: [Name] - [Contact]
- Multisig Owner 1: [Name] - [Contact]
- Multisig Owner 2: [Name] - [Contact]
- Multisig Owner 3: [Name] - [Contact]

## Changelog

- 2026-09-28: Initial version created
