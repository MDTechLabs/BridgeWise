# Stellar Bridge Provider Certification

This document outlines the scoring model, requirements, and validation lifecycle for third-party bridge providers integrating with the BridgeWise ecosystem.

---

## 1. Certification Levels

BridgeWise awards certifications across five levels depending on a provider's overall score:

* **Platinum** (Score &ge; 95): High-performance, highly secure production-grade bridges exceeding reliability thresholds.
* **Gold** (Score &ge; 85): Stable, fully-compliant production bridges matching standard service agreements.
* **Silver** (Score &ge; 70): Suitable for standard transaction routing but may have higher latency or lower historical operations count.
* **Bronze** (Score &ge; 50): Basic level meeting compliance metrics but not fully optimized.
* **Uncertified** (Score < 50): Fails minimum security, reliability, or version requirements.

---

## 2. Scoring Model Breakdown

The overall score is a weighted sum (0 to 100) of five criteria:

| Criterion | Weight | Evaluated Metrics |
| :--- | :--- | :--- |
| **Security** | 30% | HTTPS protocol enforcement, Valid/signed metadata schemas |
| **Reliability** | 25% | Node uptime percentage, Operations transaction success rate |
| **Performance** | 15% | Average round-trip execution latency (ms) |
| **Compliance** | 15% | Semver validation, Multi-network support, Number of supported assets |
| **Trust** | 15% | Historical transaction count, Days active since initial registration |

### Scoring Formulas

1. **Security**: Uses HTTPS (+50 pts) and Valid Metadata (+50 pts).
2. **Reliability**: `(Uptime % * 0.5) + (Success Rate % * 0.5)`.
3. **Performance**: Latency decay formula: `100 - (Avg Latency Ms / 2000) * 100` (capped between 0 and 100).
4. **Compliance**: Semver format (+34 pts), network match (+33 pts), asset diversity score (up to 33 pts based on asset count).
5. **Trust**: Registration age ratio (capped at 90 days, 50 pts) + historical operation count ratio (capped at 10,000 ops, 50 pts).

---

## 3. Querying Certified Providers

To fetch active, high-trust providers within the codebase, developers can query the registry directly:

```typescript
import { defaultStellarBridgeProviderRegistry } from '../../src/certification/providers/stellar';

// Query for active platinum/gold providers
const premiumProviders = defaultStellarBridgeProviderRegistry.query({
  status: 'active',
  validOnly: true,
  level: 'platinum',
});
```
