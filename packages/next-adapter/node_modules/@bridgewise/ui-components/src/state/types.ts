export interface AddressValidationState {
  address: string;
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
  isDirty: boolean;
}

export interface TransactionLockState {
  isLocked: boolean;
  isSubmitting: boolean;
  activeLockId?: string;
  lockTimeRemaining: number;
  canSubmit: boolean;
  error?: string;
}

export interface BridgewiseUIState {
  addressValidation: AddressValidationState;
  transactionLock: TransactionLockState;
}

export type StateSelector<Selected> = (state: BridgewiseUIState) => Selected;
export type EqualityFn<Selected> = (a: Selected, b: Selected) => boolean;
