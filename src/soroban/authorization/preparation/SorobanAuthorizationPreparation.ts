/**
 * Soroban Transaction Authorization Preparation
 *
 * Standalone component for detecting, preparing, and validating
 * authorization data required by Soroban contract transactions.
 *
 * This file intentionally has no external dependencies and does
 * not modify existing application or signing code.
 */

interface AuthorizationRequirement {
  id: string;
  address: string;
  contractId: string;
  functionName: string;
  arguments: unknown[];
  required: boolean;
}

interface AuthorizationPayload {
  readonly requirementId: string;
  readonly address: string;
  readonly contractId: string;
  readonly functionName: string;
  readonly arguments: readonly unknown[];
  readonly preparedAt: string;
}

interface AuthorizationPreparationResult {
  readonly transactionId: string;
  readonly requiredEntries: readonly AuthorizationPayload[];
  readonly entryCount: number;
  readonly readyForSigning: boolean;
}

interface SorobanAuthorizationPreparationInput {
  transactionId: string;
  requirements: AuthorizationRequirement[];
}

/**
 * Deep-freeze an object to prevent prepared authorization
 * data from being modified after preparation.
 */
function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

/**
 * Generate a simple identifier for an authorization entry.
 */
function createAuthorizationId(
  index: number,
): string {
  return `auth-${Date.now()}-${index}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

/**
 * Standalone Soroban authorization preparation component.
 */
export class SorobanAuthorizationPreparation {
  /**
   * Detect authorization entries required by
   * a Soroban transaction.
   */
  detectRequiredEntries(
    requirements: AuthorizationRequirement[],
  ): AuthorizationRequirement[] {
    this.validateRequirements(requirements);

    return requirements
      .filter((requirement) => requirement.required)
      .map((requirement) => ({
        ...requirement,
        arguments: [...requirement.arguments],
      }));
  }

  /**
   * Prepare authorization payloads from detected
   * authorization requirements.
   */
  prepareAuthorization(
    input: SorobanAuthorizationPreparationInput,
  ): AuthorizationPreparationResult {
    this.validateInput(input);

    const requiredEntries =
      this.detectRequiredEntries(
        input.requirements,
      );

    const payloads = requiredEntries.map(
      (requirement, index) =>
        this.createPayload(
          requirement,
          index,
        ),
    );

    const result: AuthorizationPreparationResult = {
      transactionId: input.transactionId,
      requiredEntries: payloads,
      entryCount: payloads.length,
      readyForSigning: this.canSign(payloads),
    };

    return deepFreeze(result);
  }

  /**
   * Create an authorization payload for one
   * authorization requirement.
   */
  private createPayload(
    requirement: AuthorizationRequirement,
    index: number,
  ): AuthorizationPayload {
    const payload: AuthorizationPayload = {
      requirementId:
        requirement.id ||
        createAuthorizationId(index),

      address: requirement.address,

      contractId:
        requirement.contractId,

      functionName:
        requirement.functionName,

      arguments: [
        ...requirement.arguments,
      ],

      preparedAt:
        new Date().toISOString(),
    };

    return deepFreeze(payload);
  }

  /**
   * Validate prepared authorization data before
   * passing it to the signing workflow.
   */
  validatePreparedAuthorization(
    result: AuthorizationPreparationResult,
  ): boolean {
    if (!result.transactionId.trim()) {
      return false;
    }

    if (
      result.entryCount !==
      result.requiredEntries.length
    ) {
      return false;
    }

    for (const entry of result.requiredEntries) {
      if (!this.isValidAuthorizationPayload(entry)) {
        return false;
      }
    }

    return result.readyForSigning ===
      this.canSign(result.requiredEntries);
  }

  /**
   * Determine whether authorization data is ready
   * to be consumed by a signing layer.
   */
  canSign(
    entries: readonly AuthorizationPayload[],
  ): boolean {
    for (const entry of entries) {
      if (!this.isValidAuthorizationPayload(entry)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return authorization data in a format that a
   * signing layer can consume.
   *
   * The signing layer can later transform these
   * payloads into actual Soroban authorization
   * entries without this component depending on it.
   */
  getSigningData(
    result: AuthorizationPreparationResult,
  ): AuthorizationPayload[] {
    if (
      !this.validatePreparedAuthorization(result)
    ) {
      throw new Error(
        "Authorization data is not valid for signing.",
      );
    }

    return result.requiredEntries.map(
      (entry) => ({
        requirementId:
          entry.requirementId,

        address:
          entry.address,

        contractId:
          entry.contractId,

        functionName:
          entry.functionName,

        arguments: [
          ...entry.arguments,
        ],

        preparedAt:
          entry.preparedAt,
      }),
    );
  }

  /**
   * Check whether a specific authorization entry
   * exists in the prepared result.
   */
  hasAuthorizationEntry(
    result: AuthorizationPreparationResult,
    requirementId: string,
  ): boolean {
    return result.requiredEntries.some(
      (entry) =>
        entry.requirementId === requirementId,
    );
  }

  /**
   * Find a prepared authorization entry.
   */
  findAuthorizationEntry(
    result: AuthorizationPreparationResult,
    requirementId: string,
  ): AuthorizationPayload | undefined {
    const entry =
      result.requiredEntries.find(
        (item) =>
          item.requirementId ===
          requirementId,
      );

    if (!entry) {
      return undefined;
    }

    return {
      ...entry,
      arguments: [
        ...entry.arguments,
      ],
    };
  }

  /**
   * Serialize authorization data for storage,
   * logging, or debugging.
   */
  toJSON(
    result: AuthorizationPreparationResult,
  ): string {
    if (
      !this.validatePreparedAuthorization(result)
    ) {
      throw new Error(
        "Cannot serialize invalid authorization data.",
      );
    }

    return JSON.stringify(result);
  }

  /**
   * Validate the complete preparation input.
   */
  private validateInput(
    input: SorobanAuthorizationPreparationInput,
  ): void {
    if (!input.transactionId.trim()) {
      throw new Error(
        "Transaction ID is required.",
      );
    }

    if (!Array.isArray(input.requirements)) {
      throw new Error(
        "Authorization requirements must be an array.",
      );
    }

    this.validateRequirements(
      input.requirements,
    );
  }

  /**
   * Validate all authorization requirements.
   */
  private validateRequirements(
    requirements: AuthorizationRequirement[],
  ): void {
    const ids = new Set<string>();

    for (const requirement of requirements) {
      if (!requirement.id.trim()) {
        throw new Error(
          "Authorization requirement ID is required.",
        );
      }

      if (ids.has(requirement.id)) {
        throw new Error(
          `Duplicate authorization requirement: ${requirement.id}`,
        );
      }

      ids.add(requirement.id);

      if (!requirement.address.trim()) {
        throw new Error(
          `Authorization address is required for ${requirement.id}.`,
        );
      }

      if (!requirement.contractId.trim()) {
        throw new Error(
          `Contract ID is required for ${requirement.id}.`,
        );
      }

      if (!requirement.functionName.trim()) {
        throw new Error(
          `Function name is required for ${requirement.id}.`,
        );
      }

      if (!Array.isArray(requirement.arguments)) {
        throw new Error(
          `Arguments must be an array for ${requirement.id}.`,
        );
      }
    }
  }

  /**
   * Validate a prepared authorization payload.
   */
  private isValidAuthorizationPayload(
    entry: AuthorizationPayload,
  ): boolean {
    if (!entry.requirementId.trim()) {
      return false;
    }

    if (!entry.address.trim()) {
      return false;
    }

    if (!entry.contractId.trim()) {
      return false;
    }

    if (!entry.functionName.trim()) {
      return false;
    }

    if (!Array.isArray(entry.arguments)) {
      return false;
    }

    if (!entry.preparedAt.trim()) {
      return false;
    }

    return true;
  }
}

/**
 * --------------------------------------------------------------------------
 * Example
 * --------------------------------------------------------------------------
 *
 * This example is intentionally commented out.
 * It demonstrates how the component can be used without
 * modifying or executing existing application code.
 */

/*
const preparation =
  new SorobanAuthorizationPreparation();

const result =
  preparation.prepareAuthorization({
    transactionId: "tx-123",

    requirements: [
      {
        id: "auth-1",
        address: "GABC123...",
        contractId: "CABC123...",
        functionName: "transfer",
        arguments: [
          "GABC456...",
          100,
        ],
        required: true,
      },

      {
        id: "auth-2",
        address: "GDEF123...",
        contractId: "CDEF123...",
        functionName: "approve",
        arguments: [
          "GDEF456...",
          50,
        ],
        required: false,
      },
    ],
  });

console.log(result);

console.log(
  preparation.validatePreparedAuthorization(
    result,
  ),
);

console.log(
  preparation.getSigningData(result),
);
*/

/**
 * --------------------------------------------------------------------------
 * Expected result
 * --------------------------------------------------------------------------
 *
 * The optional authorization entry is ignored.
 *
 * The signing workflow receives only the required entry:
 *
 * {
 *   transactionId: "tx-123",
 *   requiredEntries: [
 *     {
 *       requirementId: "auth-1",
 *       address: "GABC123...",
 *       contractId: "CABC123...",
 *       functionName: "transfer",
 *       arguments: [
 *         "GABC456...",
 *         100
 *       ],
 *       preparedAt: "..."
 *     }
 *   ],
 *   entryCount: 1,
 *   readyForSigning: true
 * }
 */