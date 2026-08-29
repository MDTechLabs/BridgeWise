import * as fs from 'fs';
import * as path from 'path';
import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';
import { parseSolidityFiles, StateVerifier, InvariantCheckResult } from '../invariants';

@Injectable()
export class CheckInvariantsCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'check-invariants',
    description:
      'Run static formal invariant checks on bridge contracts to verify accounting invariants (e.g. locked reserves >= minted wrapped tokens).',
    usage:
      'bridgewise check-invariants --path <contracts_directory> [--severity critical|warning|info|all] [--format json|text]',
    aliases: ['invariants', 'verify-invariants'],
    options: [
      {
        name: 'path',
        alias: 'p',
        description: 'Path to directory or file containing Solidity (.sol) contracts to analyze.',
        required: true,
        type: 'string',
      },
      {
        name: 'severity',
        alias: 's',
        description: 'Minimum severity threshold for reporting violations.',
        defaultValue: 'warning',
        type: 'string',
      },
      {
        name: 'fail-on-violations',
        alias: 'f',
        description: 'Exit with non-zero code if violations are found (useful for CI/CD).',
        defaultValue: true,
        type: 'boolean',
      },
    ],
  };

  private readonly verifier = new StateVerifier();

  async execute(
    args: string[],
    options: ParsedOptions,
  ): Promise<CommandResult<InvariantCheckResult>> {
    const targetPath = options.path || args[0];
    if (!targetPath) {
      return {
        success: false,
        command: this.definition.name,
        error:
          'Contract path is required. Specify via --path <directory> or as first argument.',
        timestamp: new Date().toISOString(),
      };
    }

    // Resolve and validate the input path
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        command: this.definition.name,
        error: `Path does not exist: ${resolvedPath}`,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Collect all .sol files from the path
      const solFiles = this.collectSolFiles(resolvedPath);
      if (solFiles.length === 0) {
        return {
          success: false,
          command: this.definition.name,
          error: `No Solidity (.sol) files found in: ${resolvedPath}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Read and parse each file
      const sources = solFiles.map((filePath) => ({
        path: filePath,
        content: fs.readFileSync(filePath, 'utf-8'),
      }));

      const contracts = parseSolidityFiles(sources);
      if (contracts.length === 0) {
        return {
          success: false,
          command: this.definition.name,
          error: `No valid Solidity contracts found in the provided files. Ensure files contain 'contract <Name> { ... }' declarations.`,
          timestamp: new Date().toISOString(),
        };
      }

      // Run invariant verification
      const result = this.verifier.verify(contracts);

      // Filter by severity if requested
      const severityFilter = (options.severity || 'all').toLowerCase();
      if (severityFilter !== 'all') {
        const severityOrder = ['info', 'warning', 'critical'];
        const minIndex = severityOrder.indexOf(severityFilter);
        if (minIndex >= 0) {
          result.violations = result.violations.filter((v) => {
            const vIndex = severityOrder.indexOf(v.severity);
            return vIndex >= minIndex;
          });
        }
      }

      // Recompute allInvariantsSatisfied after filtering — respect the severity threshold
      const severityOrder = ['info', 'warning', 'critical'];
      const minSeverityIndex = severityOrder.indexOf(
        (options.severity || 'all').toLowerCase(),
      );
      const effectiveMinIndex = minSeverityIndex >= 0 ? minSeverityIndex : 0;

      result.allInvariantsSatisfied = !result.violations.some((v) => {
        const vIndex = severityOrder.indexOf(v.severity);
        return vIndex >= effectiveMinIndex;
      });

      const failOnViolations =
        options['fail-on-violations'] !== undefined
          ? options['fail-on-violations'] !== false &&
            options['fail-on-violations'] !== 'false'
          : true;

      const success = failOnViolations ? result.allInvariantsSatisfied : true;

      return {
        success,
        command: this.definition.name,
        data: result,
        message: result.summary,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        command: this.definition.name,
        error: err?.message || 'Failed to analyze contracts',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Recursively collect all .sol files from a directory or single file path.
   */
  private collectSolFiles(targetPath: string): string[] {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      return targetPath.endsWith('.sol') ? [targetPath] : [];
    }

    const results: string[] = [];
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-contract directories
        if (
          ['node_modules', '.git', 'dist', 'build', 'cache', 'artifacts'].includes(
            entry.name,
          )
        ) {
          continue;
        }
        results.push(...this.collectSolFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.sol')) {
        results.push(fullPath);
      }
    }
    return results.sort();
  }
}
