# Soroban Route Recommendation Benchmark Report

Generated at: 2026-06-26T06:58:10.365Z

## Summary

| Scenario | Execution Time (ms) | Peak Memory (MB) | Accuracy |
|---|---|---|---|
| OPTIMAL | 0.0125 | 0.0000 | ✅ |
| HIGH_CONGESTION | 0.0018 | 5.2398 | ✅ |
| UNRELIABLE_PROVIDERS | 0.0009 | 2.4725 | ✅ |

## Detailed Results

### Scenario: OPTIMAL
- **Expected Best Route**: `route-optimal-1`
- **Actual Best Route**: `route-optimal-1`
- **Accuracy**: Pass

**Score Distribution**:
| Route ID | Final Score |
|---|---|
| `route-optimal-1` | 0.8750 |
| `route-optimal-2` | 0.6243 |
| `route-optimal-3` | 0.1250 |

### Scenario: HIGH_CONGESTION
- **Expected Best Route**: `route-congestion-2`
- **Actual Best Route**: `route-congestion-2`
- **Accuracy**: Pass

**Score Distribution**:
| Route ID | Final Score |
|---|---|
| `route-congestion-2` | 0.6250 |
| `route-congestion-3` | 0.3750 |

### Scenario: UNRELIABLE_PROVIDERS
- **Expected Best Route**: `route-unreliable-2`
- **Actual Best Route**: `route-unreliable-2`
- **Accuracy**: Pass

**Score Distribution**:
| Route ID | Final Score |
|---|---|
| `route-unreliable-2` | 0.5000 |

