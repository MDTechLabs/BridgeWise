/**
 * OpenAPI contract validation (#1248).
 *
 * The OpenAPI document is currently built at runtime and served at
 * `/api/docs`, and nothing checks it. Across 37 controllers that means a
 * contract defect — a duplicated `operationId`, an undocumented error
 * response, a path parameter that is never declared — ships silently and
 * surfaces as a broken generated SDK or a consumer integrating against
 * documentation that does not match the API.
 *
 * Everything here is a pure function over a document object, so the rules are
 * testable without booting the application.
 */

export type ContractSeverity = 'error' | 'warning';

export interface ContractViolation {
  rule: string;
  severity: ContractSeverity;
  message: string;
  /** JSON-pointer-ish location, e.g. `paths./transactions.get`. */
  location: string;
}

export interface ValidationOptions {
  /**
   * Treat missing operation descriptions as an error rather than a warning.
   * Off by default — most APIs adopt descriptions incrementally.
   */
  requireDescriptions?: boolean;
  /** HTTP status codes every operation must document. */
  requiredResponses?: string[];
}

export interface ValidationReport {
  valid: boolean;
  violations: ContractViolation[];
  errorCount: number;
  warningCount: number;
  operationCount: number;
}

/** Minimal shape of the parts of an OpenAPI document we inspect. */
interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  responses?: Record<string, unknown>;
  requestBody?: { content?: Record<string, unknown> };
}

interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

const DEFAULT_REQUIRED_RESPONSES: string[] = [];

function isOperation(method: string): boolean {
  return (HTTP_METHODS as readonly string[]).includes(method);
}

/** Extracts `{name}` placeholders from a path template. */
export function pathTemplateParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

/** True when the status code denotes success. */
function isSuccessCode(code: string): boolean {
  if (code === 'default') return false;
  const numeric = Number(code);
  return Number.isFinite(numeric) && numeric >= 200 && numeric < 300;
}

/**
 * Validates an OpenAPI document against contract rules.
 *
 * Severity split is deliberate: anything that breaks a *consumer* — a
 * duplicate operationId, an undeclared path parameter, a missing success
 * response — is an error. Anything that merely degrades documentation
 * quality is a warning, so adopting this does not require fixing every
 * missing summary before it can run in CI.
 */
export function validateOpenApiContract(
  document: unknown,
  options: ValidationOptions = {},
): ValidationReport {
  const violations: ContractViolation[] = [];
  const add = (
    rule: string,
    severity: ContractSeverity,
    message: string,
    location: string,
  ) => violations.push({ rule, severity, message, location });

  if (!document || typeof document !== 'object') {
    add(
      'document-present',
      'error',
      'The OpenAPI document is missing or is not an object.',
      '$',
    );
    return report(violations, 0);
  }

  const doc = document as OpenApiDocument;

  // ── Document-level requirements ──────────────────────────────────────────
  if (!doc.openapi) {
    add('openapi-version', 'error', '`openapi` version is missing.', 'openapi');
  } else if (!/^3\./.test(doc.openapi)) {
    add(
      'openapi-version',
      'error',
      `Unsupported OpenAPI version "${doc.openapi}"; expected 3.x.`,
      'openapi',
    );
  }

  if (!doc.info?.title) {
    add('info-title', 'error', '`info.title` is missing.', 'info.title');
  }
  if (!doc.info?.version) {
    add('info-version', 'error', '`info.version` is missing.', 'info.version');
  }
  if (!doc.servers || doc.servers.length === 0) {
    add(
      'servers-declared',
      'warning',
      'No servers are declared, so generated clients have no base URL.',
      'servers',
    );
  }

  const paths = doc.paths ?? {};
  if (Object.keys(paths).length === 0) {
    add('paths-present', 'error', 'The document declares no paths.', 'paths');
    return report(violations, 0);
  }

  const declaredTags = new Set(
    (doc.tags ?? []).map((t) => t.name).filter(Boolean),
  );
  const usedTags = new Set<string>();
  const operationIds = new Map<string, string[]>();
  const requiredResponses =
    options.requiredResponses ?? DEFAULT_REQUIRED_RESPONSES;
  let operationCount = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    const templateParams = pathTemplateParams(path);

    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!isOperation(method)) continue;
      operationCount++;

      const where = `paths.${path}.${method}`;

      // ── operationId ────────────────────────────────────────────────────
      if (!operation.operationId) {
        add(
          'operation-id-present',
          'error',
          'Operation has no `operationId`; SDK generators fall back to unstable generated names.',
          where,
        );
      } else {
        const seen = operationIds.get(operation.operationId) ?? [];
        seen.push(where);
        operationIds.set(operation.operationId, seen);
      }

      // ── Responses ──────────────────────────────────────────────────────
      const responses = operation.responses ?? {};
      const codes = Object.keys(responses);

      if (codes.length === 0) {
        add(
          'responses-documented',
          'error',
          'Operation documents no responses at all.',
          where,
        );
      } else if (!codes.some(isSuccessCode)) {
        add(
          'success-response',
          'error',
          `Operation documents no 2xx response (found: ${codes.join(', ')}).`,
          where,
        );
      }

      for (const required of requiredResponses) {
        if (!codes.includes(required)) {
          add(
            'required-response',
            'warning',
            `Operation does not document a ${required} response.`,
            where,
          );
        }
      }

      // ── Path parameters ────────────────────────────────────────────────
      const declaredParams = (operation.parameters ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name)
        .filter((n): n is string => Boolean(n));

      for (const templateParam of templateParams) {
        if (!declaredParams.includes(templateParam)) {
          add(
            'path-parameter-declared',
            'error',
            `Path declares "{${templateParam}}" but the operation has no matching path parameter.`,
            where,
          );
        }
      }

      for (const declared of declaredParams) {
        if (!templateParams.includes(declared)) {
          add(
            'path-parameter-used',
            'error',
            `Operation declares path parameter "${declared}", which does not appear in the path template.`,
            where,
          );
        }
      }

      // A path parameter is always required; an optional one is meaningless
      // and misleads generated clients.
      for (const param of operation.parameters ?? []) {
        if (param.in === 'path' && param.required === false) {
          add(
            'path-parameter-required',
            'error',
            `Path parameter "${param.name}" is marked optional; path parameters are always required.`,
            where,
          );
        }
      }

      // ── Tags ───────────────────────────────────────────────────────────
      if (!operation.tags || operation.tags.length === 0) {
        add(
          'operation-tagged',
          'warning',
          'Operation has no tag, so it is ungrouped in generated documentation.',
          where,
        );
      } else {
        for (const tag of operation.tags) {
          usedTags.add(tag);
          if (declaredTags.size > 0 && !declaredTags.has(tag)) {
            add(
              'tag-declared',
              'warning',
              `Operation uses tag "${tag}", which is not declared at the document level.`,
              where,
            );
          }
        }
      }

      // ── Documentation quality ──────────────────────────────────────────
      if (!operation.summary) {
        add('operation-summary', 'warning', 'Operation has no summary.', where);
      }
      if (options.requireDescriptions && !operation.description) {
        add(
          'operation-description',
          'error',
          'Operation has no description.',
          where,
        );
      }

      // ── Request bodies ─────────────────────────────────────────────────
      if (
        operation.requestBody &&
        Object.keys(operation.requestBody.content ?? {}).length === 0
      ) {
        add(
          'request-body-content',
          'error',
          'Operation declares a request body with no content types.',
          where,
        );
      }

      if (
        (method === 'get' || method === 'head') &&
        operation.requestBody !== undefined
      ) {
        add(
          'no-body-on-get',
          'warning',
          `A ${method.toUpperCase()} operation declares a request body; most clients and proxies will drop it.`,
          where,
        );
      }
    }
  }

  // ── Cross-operation checks ───────────────────────────────────────────────
  for (const [operationId, locations] of operationIds) {
    if (locations.length > 1) {
      add(
        'operation-id-unique',
        'error',
        `operationId "${operationId}" is used by ${locations.length} operations (${locations.join(', ')}). SDK generators produce colliding method names.`,
        locations[0],
      );
    }
  }

  for (const declared of declaredTags) {
    if (declared && !usedTags.has(declared)) {
      add(
        'tag-used',
        'warning',
        `Tag "${declared}" is declared but no operation uses it.`,
        'tags',
      );
    }
  }

  return report(violations, operationCount);
}

function report(
  violations: ContractViolation[],
  operationCount: number,
): ValidationReport {
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  return {
    valid: errorCount === 0,
    violations,
    errorCount,
    warningCount: violations.length - errorCount,
    operationCount,
  };
}

/** Formats a report for a terminal or CI log. */
export function formatReport(report: ValidationReport): string {
  if (report.violations.length === 0) {
    return `OpenAPI contract valid — ${report.operationCount} operations, no violations.\n`;
  }

  const lines = [
    `OpenAPI contract: ${report.errorCount} error(s), ${report.warningCount} warning(s) across ${report.operationCount} operations.`,
    '',
  ];

  for (const severity of ['error', 'warning'] as const) {
    const matching = report.violations.filter((v) => v.severity === severity);
    if (matching.length === 0) continue;

    lines.push(`${severity.toUpperCase()}S:`);
    for (const violation of matching) {
      lines.push(`  [${violation.rule}] ${violation.location}`);
      lines.push(`      ${violation.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
