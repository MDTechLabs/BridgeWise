import { Injectable, Logger } from '@nestjs/common';

/** A declared authorization requirement for a Soroban contract invocation. */
export interface AuthRequirement {
  contractId: string;
  functionName: string;
  /** The account expected to authorize this invocation. */
  authorizer: string;
  requiresSignature?: boolean;
  requiresNonce?: boolean;
  requiresExpiration?: boolean;
}

/** An authorization entry supplied by the caller. */
export interface AuthorizationEntry {
  contractId: string;
  functionName: string;
  authorizer: string;
  signature?: string;
  nonce?: number | string;
  expirationLedger?: number;
}

export enum AuthValidationCode {
  MISSING_AUTHORIZATION = 'MISSING_AUTHORIZATION',
  MISSING_SIGNATURE = 'MISSING_SIGNATURE',
  MISSING_NONCE = 'MISSING_NONCE',
  MISSING_EXPIRATION = 'MISSING_EXPIRATION',
  MALFORMED_ENTRY = 'MALFORMED_ENTRY',
}

export interface AuthValidationError {
  code: AuthValidationCode;
  contractId: string;
  functionName: string;
  message: string;
}

export interface AuthValidationResult {
  valid: boolean;
  errors: AuthValidationError[];
  /** Requirements that had no matching provided entry. */
  missing: AuthRequirement[];
}

function requirementKey(r: { contractId: string; functionName: string; authorizer: string }): string {
  return `${r.contractId}::${r.functionName}::${r.authorizer}`;
}

/**
 * Validates that the authorization entries supplied for a set of Soroban
 * contract invocations satisfy their declared requirements before submission,
 * surfacing actionable errors for anything missing or malformed.
 */
@Injectable()
export class ContractAuthorizationValidatorService {
  private readonly logger = new Logger(ContractAuthorizationValidatorService.name);

  validate(
    requirements: AuthRequirement[],
    provided: AuthorizationEntry[],
  ): AuthValidationResult {
    const errors: AuthValidationError[] = [];
    const missing: AuthRequirement[] = [];

    const providedByKey = new Map<string, AuthorizationEntry>();
    for (const entry of provided) {
      if (!entry.contractId || !entry.functionName || !entry.authorizer) {
        errors.push({
          code: AuthValidationCode.MALFORMED_ENTRY,
          contractId: entry.contractId ?? '',
          functionName: entry.functionName ?? '',
          message: 'Authorization entry is missing contractId, functionName, or authorizer.',
        });
        continue;
      }
      providedByKey.set(requirementKey(entry), entry);
    }

    for (const req of requirements) {
      const entry = providedByKey.get(requirementKey(req));
      if (!entry) {
        missing.push(req);
        errors.push({
          code: AuthValidationCode.MISSING_AUTHORIZATION,
          contractId: req.contractId,
          functionName: req.functionName,
          message: `Missing authorization from ${req.authorizer} for ${req.contractId}.${req.functionName}.`,
        });
        continue;
      }
      if (req.requiresSignature && !entry.signature) {
        errors.push({
          code: AuthValidationCode.MISSING_SIGNATURE,
          contractId: req.contractId,
          functionName: req.functionName,
          message: `Authorization for ${req.contractId}.${req.functionName} requires a signature.`,
        });
      }
      if (req.requiresNonce && entry.nonce === undefined) {
        errors.push({
          code: AuthValidationCode.MISSING_NONCE,
          contractId: req.contractId,
          functionName: req.functionName,
          message: `Authorization for ${req.contractId}.${req.functionName} requires a nonce.`,
        });
      }
      if (req.requiresExpiration && entry.expirationLedger === undefined) {
        errors.push({
          code: AuthValidationCode.MISSING_EXPIRATION,
          contractId: req.contractId,
          functionName: req.functionName,
          message: `Authorization for ${req.contractId}.${req.functionName} requires an expiration ledger.`,
        });
      }
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.logger.debug(`Authorization validation produced ${errors.length} error(s).`);
    }
    return { valid, errors, missing };
  }

  /**
   * Returns the requirements that still need authorization entries prepared,
   * so callers can build/sign the missing entries.
   */
  prepare(requirements: AuthRequirement[], provided: AuthorizationEntry[]): AuthRequirement[] {
    return this.validate(requirements, provided).missing;
  }
}
