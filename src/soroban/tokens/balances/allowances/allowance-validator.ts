export interface AllowanceValidationResult {
  required: bigint;
  available: bigint;
  sufficient: boolean;
}

export class InsufficientAllowanceError extends Error {
  public readonly required: bigint;
  public readonly available: bigint;

  constructor(required: bigint, available: bigint) {
    super(
      `Insufficient allowance: required ${required}, available ${available}`
    );

    this.name = "InsufficientAllowanceError";
    this.required = required;
    this.available = available;
  }
}