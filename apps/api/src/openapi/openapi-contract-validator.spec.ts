import {
  formatReport,
  pathTemplateParams,
  validateOpenApiContract,
} from './openapi-contract-validator';

/** A minimal document that passes every rule. */
function validDocument(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: { title: 'BridgeWise API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [{ name: 'Transactions' }],
    paths: {
      '/transactions': {
        get: {
          operationId: 'listTransactions',
          summary: 'List transactions',
          tags: ['Transactions'],
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  };
}

function rulesOf(document: unknown, options = {}) {
  return validateOpenApiContract(document, options).violations.map((v) => v.rule);
}

describe('pathTemplateParams', () => {
  it('extracts placeholders', () => {
    expect(pathTemplateParams('/tx/{id}/legs/{legId}')).toEqual(['id', 'legId']);
  });

  it('returns nothing for a static path', () => {
    expect(pathTemplateParams('/health')).toEqual([]);
  });
});

describe('document-level rules', () => {
  it('accepts a well-formed document', () => {
    const report = validateOpenApiContract(validDocument());
    expect(report.valid).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.operationCount).toBe(1);
  });

  it('rejects a missing or non-object document', () => {
    expect(validateOpenApiContract(undefined).valid).toBe(false);
    expect(validateOpenApiContract(null).valid).toBe(false);
    expect(validateOpenApiContract('nope').valid).toBe(false);
  });

  it('requires an OpenAPI 3.x version', () => {
    const doc = validDocument();
    delete doc.openapi;
    expect(rulesOf(doc)).toContain('openapi-version');

    expect(rulesOf({ ...validDocument(), openapi: '2.0' })).toContain(
      'openapi-version',
    );
  });

  it('requires info.title and info.version', () => {
    expect(rulesOf({ ...validDocument(), info: {} })).toEqual(
      expect.arrayContaining(['info-title', 'info-version']),
    );
  });

  it('warns when no servers are declared', () => {
    const doc = validDocument();
    delete doc.servers;
    const report = validateOpenApiContract(doc);
    // A warning, not an error — the document is still usable.
    expect(report.valid).toBe(true);
    expect(rulesOf(doc)).toContain('servers-declared');
  });

  it('rejects a document with no paths', () => {
    expect(validateOpenApiContract({ ...validDocument(), paths: {} }).valid).toBe(
      false,
    );
  });
});

describe('operationId rules', () => {
  it('requires an operationId', () => {
    const doc = validDocument() as any;
    delete doc.paths['/transactions'].get.operationId;
    expect(rulesOf(doc)).toContain('operation-id-present');
  });

  it('rejects duplicate operationIds across paths', () => {
    // This is the one that silently breaks generated SDKs: two methods with
    // the same name.
    const doc = validDocument() as any;
    doc.paths['/fees'] = {
      get: {
        operationId: 'listTransactions',
        summary: 'List fees',
        tags: ['Transactions'],
        responses: { '200': { description: 'ok' } },
      },
    };

    const report = validateOpenApiContract(doc);
    expect(report.valid).toBe(false);
    const violation = report.violations.find((v) => v.rule === 'operation-id-unique');
    expect(violation?.message).toContain('listTransactions');
    expect(violation?.message).toContain('colliding method names');
  });

  it('allows the same operationId nowhere else in the document', () => {
    expect(rulesOf(validDocument())).not.toContain('operation-id-unique');
  });
});

describe('response rules', () => {
  it('rejects an operation with no responses', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.responses = {};
    expect(rulesOf(doc)).toContain('responses-documented');
  });

  it('rejects an operation documenting only errors', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.responses = {
      '400': { description: 'bad request' },
      '500': { description: 'server error' },
    };
    const report = validateOpenApiContract(doc);
    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.rule)).toContain('success-response');
  });

  it('accepts any 2xx as the success response', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.responses = { '204': { description: 'no content' } };
    expect(validateOpenApiContract(doc).valid).toBe(true);
  });

  it('does not treat `default` as a success response', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.responses = { default: { description: 'any' } };
    expect(rulesOf(doc)).toContain('success-response');
  });

  it('warns about configured required responses that are absent', () => {
    const report = validateOpenApiContract(validDocument(), {
      requiredResponses: ['400', '500'],
    });
    expect(report.valid).toBe(true); // warnings only
    expect(report.violations.filter((v) => v.rule === 'required-response')).toHaveLength(
      2,
    );
  });
});

describe('path parameter rules', () => {
  function withPath(path: string, operation: Record<string, unknown>) {
    return {
      ...validDocument(),
      paths: { [path]: { get: operation } },
    };
  }

  const baseOp = {
    operationId: 'getTransaction',
    summary: 'Get one',
    tags: ['Transactions'],
    responses: { '200': { description: 'ok' } },
  };

  it('rejects a template parameter that is never declared', () => {
    expect(rulesOf(withPath('/tx/{id}', baseOp))).toContain(
      'path-parameter-declared',
    );
  });

  it('accepts a declared template parameter', () => {
    const doc = withPath('/tx/{id}', {
      ...baseOp,
      parameters: [{ name: 'id', in: 'path', required: true }],
    });
    expect(validateOpenApiContract(doc).valid).toBe(true);
  });

  it('rejects a declared parameter that is not in the path', () => {
    const doc = withPath('/tx', {
      ...baseOp,
      parameters: [{ name: 'ghost', in: 'path', required: true }],
    });
    expect(rulesOf(doc)).toContain('path-parameter-used');
  });

  it('rejects an optional path parameter', () => {
    // A path parameter cannot be optional — the path does not exist without it.
    const doc = withPath('/tx/{id}', {
      ...baseOp,
      parameters: [{ name: 'id', in: 'path', required: false }],
    });
    expect(rulesOf(doc)).toContain('path-parameter-required');
  });

  it('ignores query parameters entirely', () => {
    const doc = withPath('/tx', {
      ...baseOp,
      parameters: [{ name: 'limit', in: 'query', required: false }],
    });
    expect(validateOpenApiContract(doc).valid).toBe(true);
  });

  it('handles several parameters in one path', () => {
    const doc = withPath('/tx/{id}/legs/{legId}', {
      ...baseOp,
      parameters: [
        { name: 'id', in: 'path', required: true },
        { name: 'legId', in: 'path', required: true },
      ],
    });
    expect(validateOpenApiContract(doc).valid).toBe(true);
  });
});

describe('tag rules', () => {
  it('warns about an untagged operation', () => {
    const doc = validDocument() as any;
    delete doc.paths['/transactions'].get.tags;
    expect(rulesOf(doc)).toContain('operation-tagged');
  });

  it('warns about a tag that is not declared at document level', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.tags = ['Undeclared'];
    expect(rulesOf(doc)).toContain('tag-declared');
  });

  it('warns about a declared tag nothing uses', () => {
    const doc = validDocument() as any;
    doc.tags.push({ name: 'Orphan' });
    expect(rulesOf(doc)).toContain('tag-used');
  });

  it('does not check declared-ness when no tags are declared', () => {
    const doc = validDocument() as any;
    delete doc.tags;
    expect(rulesOf(doc)).not.toContain('tag-declared');
  });
});

describe('request body rules', () => {
  it('rejects a request body with no content types', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].post = {
      operationId: 'createTransaction',
      summary: 'Create',
      tags: ['Transactions'],
      requestBody: { content: {} },
      responses: { '201': { description: 'created' } },
    };
    expect(rulesOf(doc)).toContain('request-body-content');
  });

  it('warns about a body on GET', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].get.requestBody = {
      content: { 'application/json': {} },
    };
    expect(rulesOf(doc)).toContain('no-body-on-get');
  });
});

describe('documentation quality rules', () => {
  it('warns about a missing summary', () => {
    const doc = validDocument() as any;
    delete doc.paths['/transactions'].get.summary;
    const report = validateOpenApiContract(doc);
    expect(report.valid).toBe(true);
    expect(report.violations.map((v) => v.rule)).toContain('operation-summary');
  });

  it('only errors on a missing description when asked', () => {
    const doc = validDocument();
    expect(validateOpenApiContract(doc).valid).toBe(true);
    expect(validateOpenApiContract(doc, { requireDescriptions: true }).valid).toBe(
      false,
    );
  });
});

describe('non-operation keys', () => {
  it('ignores path-level keys that are not HTTP methods', () => {
    const doc = validDocument() as any;
    doc.paths['/transactions'].parameters = [];
    doc.paths['/transactions'].summary = 'Transaction collection';
    const report = validateOpenApiContract(doc);
    expect(report.operationCount).toBe(1);
    expect(report.valid).toBe(true);
  });
});

describe('formatReport', () => {
  it('reports a clean document', () => {
    const output = formatReport(validateOpenApiContract(validDocument()));
    expect(output).toContain('no violations');
  });

  it('groups errors and warnings with rule and location', () => {
    const doc = validDocument() as any;
    delete doc.paths['/transactions'].get.operationId;
    delete doc.paths['/transactions'].get.summary;

    const output = formatReport(validateOpenApiContract(doc));
    expect(output).toContain('ERRORS:');
    expect(output).toContain('WARNINGS:');
    expect(output).toContain('operation-id-present');
    expect(output).toContain('paths./transactions.get');
  });
});

// ── CLI argument handling ───────────────────────────────────────────────────

import { parseArgs } from './validate-openapi';

describe('parseArgs', () => {
  it('takes the first non-flag argument as the spec path', () => {
    expect(parseArgs(['openapi.json']).specPath).toBe('openapi.json');
  });

  it('ignores extra positional arguments', () => {
    expect(parseArgs(['first.json', 'second.json']).specPath).toBe('first.json');
  });

  it('parses --require-descriptions', () => {
    expect(parseArgs(['s.json', '--require-descriptions']).options).toEqual({
      requireDescriptions: true,
    });
  });

  it('collects repeated --require-response codes', () => {
    const { options } = parseArgs([
      's.json',
      '--require-response',
      '400',
      '--require-response',
      '500',
    ]);
    expect(options.requiredResponses).toEqual(['400', '500']);
  });

  it('does not set requiredResponses when none are given', () => {
    expect(parseArgs(['s.json']).options.requiredResponses).toBeUndefined();
  });

  it('does not mistake a flag value for the spec path', () => {
    const { specPath } = parseArgs(['--require-response', '400', 'spec.json']);
    expect(specPath).toBe('spec.json');
  });

  it('returns no path when only flags are supplied', () => {
    expect(parseArgs(['--require-descriptions']).specPath).toBeUndefined();
  });
});
