# OpenAPI contract validation

Validates the BridgeWise OpenAPI document against contract-quality rules
(#1248).

## Why

The OpenAPI document is built at runtime from `@nestjs/swagger` decorators and
served at `/api/docs`. Nothing checks it. Across 37 controllers that means a
contract defect ships silently and surfaces somewhere expensive:

- a **duplicated `operationId`** produces colliding method names in a
  generated SDK
- an **undeclared path parameter** produces a client that cannot call the route
- a **missing 2xx response** leaves consumers guessing what success looks like

## Usage

### From code

```ts
import { validateOpenApiContract, formatReport } from './openapi/openapi-contract-validator';

const report = validateOpenApiContract(document);
if (!report.valid) {
  console.error(formatReport(report));
}
```

### From the command line

```bash
node dist/openapi/validate-openapi.js openapi.json
node dist/openapi/validate-openapi.js openapi.json --require-response 400 --require-response 500
node dist/openapi/validate-openapi.js openapi.json --require-descriptions
```

Exit codes: `0` valid, `1` contract errors, `2` usage or parse failure.

### Producing the document

The document is created in `apps/api/src/main.ts` via
`SwaggerModule.createDocument(app, config)`. To write it to disk for
validation, serialise that object:

```ts
const document = SwaggerModule.createDocument(app, config);
writeFileSync('openapi.json', JSON.stringify(document, null, 2));
```

## Rules

### Errors — these break consumers

| Rule | Checks |
|---|---|
| `openapi-version` | `openapi` present and 3.x |
| `info-title`, `info-version` | Required `info` fields |
| `paths-present` | At least one path |
| `operation-id-present` | Every operation has an `operationId` |
| `operation-id-unique` | No two operations share one |
| `responses-documented` | Operation documents at least one response |
| `success-response` | At least one 2xx (`default` does not count) |
| `path-parameter-declared` | Every `{param}` has a matching parameter |
| `path-parameter-used` | Every declared path parameter appears in the template |
| `path-parameter-required` | Path parameters are never optional |
| `request-body-content` | A declared request body has content types |

### Warnings — documentation quality

| Rule | Checks |
|---|---|
| `servers-declared` | At least one server, so clients have a base URL |
| `operation-tagged` | Operation belongs to a tag |
| `tag-declared` | Tags used are declared at document level |
| `tag-used` | Declared tags are actually used |
| `operation-summary` | Operation has a summary |
| `no-body-on-get` | GET/HEAD do not declare a request body |
| `required-response` | Configured status codes are documented |

### Opt-in

| Rule | Enabled by |
|---|---|
| `operation-description` | `--require-descriptions` |

## The severity split

Anything that breaks a **consumer** is an error. Anything that merely degrades
documentation is a warning.

That split is what makes this adoptable: it can be wired into CI today without
first fixing every missing summary across 37 controllers. Tighten it over time
by promoting warnings — `--require-descriptions` exists for exactly that.

## Wiring into CI

Not wired in by default, because it needs a serialised spec and where that gets
produced is a repo-level decision. Once a spec is written:

```yaml
- name: Validate OpenAPI contract
  run: node apps/api/dist/openapi/validate-openapi.js openapi.json
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| `success-response` on an operation that clearly works | Only `default` or error codes documented; `default` is not treated as success |
| `path-parameter-declared` after adding a route | `@Param()` present but no Swagger parameter metadata emitted |
| `operation-id-unique` after a refactor | Two controller methods produced the same id; set one explicitly with `@ApiOperation({ operationId })` |
| Everything reports `tag-declared` | Tags used on operations but none declared via `.addTag()` in `main.ts` |
