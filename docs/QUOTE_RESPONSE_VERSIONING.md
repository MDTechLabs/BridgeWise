# Quote response schema versioning

`POST /quotes` supports explicit response schema selection through the
`X-Quote-Response-Version` request header. This is independent of the quote
request body and does not require configuration.

## Versions

| Requested header | Response header | Response body |
| --- | --- | --- |
| omitted or blank | `0` | Legacy bare array of quote objects |
| `0` | `0` | Legacy bare array of quote objects |
| `1` | `1` | Versioned envelope: `{ "schemaVersion": "1.0.0", "quotes": [...] }` |

Example request for v1:

```http
POST /quotes HTTP/1.1
Content-Type: application/json
X-Quote-Response-Version: 1

{"fromChain":"ethereum","toChain":"stellar","fromToken":"USDC","amount":"100"}
```

Example v1 response:

```json
{
  "schemaVersion": "1.0.0",
  "quotes": [
    {
      "id": "quote-soroban-...",
      "provider": "SorobanBridge",
      "fromChain": "ethereum",
      "toChain": "stellar",
      "fromToken": "USDC",
      "toToken": "USDC",
      "inputAmount": "100",
      "outputAmount": "99.800000",
      "feeAmount": "0.2",
      "feeToken": "XLM",
      "estimatedTimeSeconds": 5,
      "netOutputAmount": "99.600000"
    }
  ]
}
```

All successful quote responses include `X-Quote-Response-Version` and
`Cache-Control: no-store`. Unknown, malformed, and future versions return
`406 Not Acceptable` with a message listing the currently supported versions;
the server never silently downgrades an explicit version request. Invalid
quote request bodies continue to return `400 Bad Request`.

## Compatibility and dependencies

Clients that omit the version header continue receiving the original bare
array. Clients opting into v1 must read `quotes` from the envelope and should
check `schemaVersion` before decoding it. The API owns version selection and
serialization; callers of `QuotesService.getAggregatedQuotes` continue to
receive `QuoteOption[]` and do not depend on HTTP response schemas.

The quote controller depends on the quote service's `QuoteOption` contract.
Any upstream adapter/provider change that alters those fields must be reviewed
against both the legacy array and the v1 envelope. Web, CLI, and other API
consumers that parse `POST /quotes` are downstream dependencies and need to
send `X-Quote-Response-Version: 1` before adopting the envelope. The v1 schema
is additive and existing consumers remain on version 0 until they opt in.

## Troubleshooting

- `406 Not Acceptable`: send `0` or `1` in `X-Quote-Response-Version`.
- A bare array: the request omitted the header or selected version `0`.
- Missing `quotes`: confirm the response header is `1`; only v1 uses the
  envelope shape.
- Cached/stale response: quote responses are marked `no-store`; check whether
  an intermediary is overriding cache directives.

## Verification

Run the response-version unit tests and quote endpoint e2e tests with:

```bash
npx jest apps/api/src/quotes/quote-response-version.spec.ts --runInBand
npm run test:e2e -- --runInBand test/quotes.e2e-spec.ts
```
