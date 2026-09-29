#!/usr/bin/env node
/**
 * CLI for OpenAPI contract validation (#1248).
 *
 *   node dist/openapi/validate-openapi.js <spec.json> [--require-descriptions]
 *                                                     [--require-response 400]
 *
 * Exits non-zero when the contract has errors, so it can gate CI. Warnings
 * are printed but do not fail the run — adopting this should not require
 * fixing every missing summary across 37 controllers first.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatReport,
  validateOpenApiContract,
  type ValidationOptions,
} from './openapi-contract-validator';

interface ParsedArgs {
  specPath?: string;
  options: ValidationOptions;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const options: ValidationOptions = {};
  const requiredResponses: string[] = [];
  let specPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--require-descriptions') {
      options.requireDescriptions = true;
    } else if (arg === '--require-response') {
      const code = argv[++i];
      if (code) requiredResponses.push(code);
    } else if (!arg.startsWith('--')) {
      specPath ??= arg;
    }
  }

  if (requiredResponses.length > 0)
    options.requiredResponses = requiredResponses;
  return { specPath, options };
}

export function loadSpec(path: string): unknown {
  const raw = readFileSync(resolve(path), 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Could not parse "${path}" as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/* istanbul ignore next — entry point, exercised via the exported helpers. */
function main(): void {
  const { specPath, options } = parseArgs(process.argv.slice(2));

  if (!specPath) {
    process.stderr.write(
      'Usage: validate-openapi <spec.json> [--require-descriptions] [--require-response <code>]\n',
    );
    process.exit(2);
  }

  let spec: unknown;
  try {
    spec = loadSpec(specPath);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
    return;
  }

  const report = validateOpenApiContract(spec, options);
  process.stdout.write(formatReport(report));
  process.exit(report.valid ? 0 : 1);
}

/* istanbul ignore next */
if (require.main === module) {
  main();
}
