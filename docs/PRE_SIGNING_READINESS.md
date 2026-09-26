# Pre-signing readiness checks

Use `PreSigningSafetyGate` before invoking a wallet or service signer. It
requires checks for balance, allowance, route validity, configured limits,
provider health, and quote freshness. The signer callback is invoked only when
all six checks resolve successfully; a rejected check, unavailable dependency,
or invalid clock blocks signing. Quote freshness runs last to minimize the gap
between expiry validation and the signing call.

```ts
const gate = new PreSigningSafetyGate({
  balance: async (intent) => assertCurrentBalances(intent),
  allowance: async (intent) => assertCurrentAllowance(intent),
  routeValidity: async (intent) => assertRouteStillValid(intent),
  limits: async (intent) => assertWithinPolicyLimits(intent),
  providerHealth: async (intent) => assertProviderHealthy(intent),
  quoteFreshness: async (intent) => assertQuoteFresh(intent),
});

const result = await gate.sign(intent, (validatedIntent) =>
  wallet.signTransaction(validatedIntent.transaction),
);
```

These callbacks are required at construction. Wire them to authoritative
chain/provider reads for the same account, route, spender, and transaction
intent that will be signed. Existing helpers include the Soroban token balance
reader, route revalidation service, provider registry/health monitor, and
Stellar pre-execution validators. A read error must reject; do not substitute a
cached or default value for unavailable state. Check the exact required balance
and allowance using integer base units, and enforce chain-specific amount, fee,
slippage, and resource caps.

## Failure handling and operations

- `PreSigningBlockedError` contains the failed check names and safe failure
  codes. Its message does not include account addresses, amounts, provider
  responses, or transaction contents.
- Unknown dependency errors become `CHECK_UNAVAILABLE`; throw
  `PreSigningCheckError` with a stable code for known rejection reasons.
- Do not catch a blocked result and call the signer anyway. Refresh relevant
  chain state or quote, correct the route or limit, then retry through the gate.
- Optional `onCheckComplete` receives only a fixed check name, pass/fail bit,
  and optional code. Keep metric labels bounded; never attach intent or account
  data. Observer callback errors are ignored and cannot disable checks.
- The gate does not submit transactions or own RPC credentials. Applications
  must provide their approved balance, allowance, route, policy, provider, and
  quote readers. A missing provider integration is a deployment dependency;
  do not configure a permissive no-op check.

## Verification

```bash
pnpm exec jest src/execution/safety/pre-signing/pre-signing-safety-gate.spec.ts --runInBand
```
