import { useState, useCallback } from 'react';
import {
  validateDestinationAddress,
  validateAddress,
  getChainValidationRules,
  ValidationResult,
} from '../address-validation';

export interface UseAddressValidationOptions {
  chain: string;
  validateOnChange?: boolean; // Default: false
  onValidationChange?: (isValid: boolean, error?: string) => void;
}

export interface UseAddressValidationReturn {
  address: string;
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
  isDirty: boolean;
  setAddress: (address: string) => void;
  validate: () => boolean;
  clear: () => void;
  validationRules?: {
    format: string;
    example: string;
    requirements: string[];
  };
}

/**
 * React hook for address validation with state management
 */
export function useAddressValidation(
  options: UseAddressValidationOptions
): UseAddressValidationReturn {
  const { chain, validateOnChange = false, onValidationChange } = options;

  const [address, setAddressState] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[] | undefined>();
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Get validation rules for the chain
  const validationRules = (() => {
    try {
      return getChainValidationRules(chain);
    } catch {
      return undefined;
    }
  })();

  /**
   * Validate current address
   */
  const validate = useCallback(() => {
    if (!address) {
      setIsValid(false);
      setErrorMessage('Address is required');
      onValidationChange?.(false, 'Address is required');
      return false;
    }

    const result = validateDestinationAddress(address, chain);
    
    setIsValid(result.isValid);
    setErrorMessage(result.errorMessage);
    setWarnings(result.warnings);
    
    onValidationChange?.(result.isValid, result.errorMessage);
    
    return result.isValid;
  }, [address, chain, onValidationChange]);

  /**
   * Set address and optionally validate
   */
  const setAddress = useCallback((newAddress: string) => {
    setAddressState(newAddress);
    setIsDirty(true);
    
    if (validateOnChange && newAddress) {
      validate();
    } else {
      // Reset validation state when address changes
      setIsValid(false);
      setErrorMessage(undefined);
      setWarnings(undefined);
    }
  }, [validateOnChange, validate]);

  /**
   * Clear address and validation state
   */
  const clear = useCallback(() => {
    setAddressState('');
    setIsValid(false);
    setErrorMessage(undefined);
    setWarnings(undefined);
    setIsDirty(false);
    onValidationChange?.(false, undefined);
  }, [onValidationChange]);

  return {
    address,
    isValid,
    errorMessage,
    warnings,
    isDirty,
    setAddress,
    validate,
    clear,
    validationRules: validationRules ? {
      format: validationRules.format,
      example: validationRules.example,
      requirements: validationRules.requirements,
    } : undefined,
  };
}

/**
 * Simple validation function for one-off validations
 * Can be used without the full hook
 */
export function simpleValidateAddress(
  address: string,
  chain: string
): { isValid: boolean; error?: string } {
  const result = validateAddress(address, chain);
  return {
    isValid: result.isValid,
    error: result.error,
  };
}
