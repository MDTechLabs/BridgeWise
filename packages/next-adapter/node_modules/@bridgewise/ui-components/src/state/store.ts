import { useEffect, useRef, useState } from 'react';
import {
  AddressValidationState,
  BridgewiseUIState,
  EqualityFn,
  StateSelector,
  TransactionLockState,
} from './types';

type StateListener = () => void;

type Unsubscribe = () => void;

const defaultAddressValidationState: AddressValidationState = {
  address: '',
  isValid: false,
  errorMessage: undefined,
  warnings: undefined,
  isDirty: false,
};

const defaultTransactionLockState: TransactionLockState = {
  isLocked: false,
  isSubmitting: false,
  activeLockId: undefined,
  lockTimeRemaining: 0,
  canSubmit: true,
  error: undefined,
};

const defaultState: BridgewiseUIState = {
  addressValidation: defaultAddressValidationState,
  transactionLock: defaultTransactionLockState,
};

const listeners = new Set<StateListener>();
let currentState: BridgewiseUIState = defaultState;

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

const deriveTransactionLockState = (
  next: TransactionLockState
): TransactionLockState => ({
  ...next,
  canSubmit: !next.isLocked && !next.isSubmitting,
});

export const bridgewiseStore = {
  getState: (): BridgewiseUIState => currentState,

  setState: (updater: Partial<BridgewiseUIState> | ((prevState: BridgewiseUIState) => BridgewiseUIState)) => {
    const nextState =
      typeof updater === 'function' ? updater(currentState) : updater;

    if (nextState === currentState) {
      return;
    }

    currentState = {
      ...currentState,
      ...nextState,
      transactionLock: nextState.transactionLock
        ? deriveTransactionLockState({
            ...currentState.transactionLock,
            ...nextState.transactionLock,
          })
        : currentState.transactionLock,
    };

    notifyListeners();
  },

  subscribe: (listener: StateListener): Unsubscribe => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useBridgewiseStore = <Selected>(
  selector: StateSelector<Selected>,
  isEqual: EqualityFn<Selected> = Object.is
): Selected => {
  const [selectedState, setSelectedState] = useState<Selected>(() =>
    selector(bridgewiseStore.getState())
  );

  const selectedRef = useRef(selectedState);

  useEffect(() => {
    const handleChange = () => {
      const nextState = selector(bridgewiseStore.getState());

      if (!isEqual(nextState, selectedRef.current)) {
        selectedRef.current = nextState;
        setSelectedState(nextState);
      }
    };

    const unsubscribe = bridgewiseStore.subscribe(handleChange);
    handleChange();

    return unsubscribe;
  }, [selector, isEqual]);

  return selectedState;
};

export const getBridgewiseState = (): BridgewiseUIState => bridgewiseStore.getState();

export const updateAddressValidationState = (
  patch: Partial<AddressValidationState>
): void => {
  bridgewiseStore.setState((prev) => ({
    ...prev,
    addressValidation: {
      ...prev.addressValidation,
      ...patch,
    },
  }));
};

export const resetAddressValidationState = (): void => {
  bridgewiseStore.setState((prev) => ({
    ...prev,
    addressValidation: defaultAddressValidationState,
  }));
};

export const updateTransactionLockState = (
  patch: Partial<TransactionLockState>
): void => {
  bridgewiseStore.setState((prev) => ({
    ...prev,
    transactionLock: {
      ...prev.transactionLock,
      ...patch,
    },
  }));
};

export const resetTransactionLockState = (): void => {
  bridgewiseStore.setState((prev) => ({
    ...prev,
    transactionLock: defaultTransactionLockState,
  }));
};

export const setTransactionLock = (
  partial: Partial<TransactionLockState>
): void => updateTransactionLockState(partial);
