import { Injectable, Logger } from '@nestjs/common';
import {
  decodeStrKey,
  isValidContract,
  isValidEd25519PublicKey,
  isValidMuxedAccount,
  StrKeyType,
} from './strkey.util';

export type StellarNetwork = 'public' | 'testnet' | 'futurenet';

export enum AccountValidationCode {
  EMPTY = 'EMPTY',
  MALFORMED = 'MALFORMED',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
}

export interface AccountValidationError {
  code: AccountValidationCode;
  message: string;
}

export interface DestinationValidationOptions {
  /** Network the transfer will execute on. */
  network: StellarNetwork;
  /** If the caller already knows the account's network, mismatches are rejected. */
  accountNetwork?: StellarNetwork;
  /** Account types accepted as a destination (defaults to ed25519 + muxed). */
  allowedTypes?: StrKeyType[];
}

export interface DestinationValidationResult {
  valid: boolean;
  address: string;
  type: StrKeyType | null;
  network: StellarNetwork;
  errors: AccountValidationError[];
}

/**
 * Validates destination accounts before a bridge transfer is initiated:
 * malformed addresses, unsupported account types, and network mismatches all
 * produce actionable errors.
 */
@Injectable()
export class DestinationAccountValidatorService {
  private readonly logger = new Logger(DestinationAccountValidatorService.name);

  private static readonly DEFAULT_ALLOWED_TYPES: StrKeyType[] = [
    StrKeyType.ED25519_PUBLIC_KEY,
    StrKeyType.MUXED_ACCOUNT,
  ];

  validate(
    address: string,
    options: DestinationValidationOptions,
  ): DestinationValidationResult {
    const errors: AccountValidationError[] = [];
    const allowedTypes =
      options.allowedTypes ?? DestinationAccountValidatorService.DEFAULT_ALLOWED_TYPES;

    if (!address || address.trim().length === 0) {
      errors.push({ code: AccountValidationCode.EMPTY, message: 'Destination account is required.' });
      return { valid: false, address, type: null, network: options.network, errors };
    }

    const decoded = decodeStrKey(address.trim());
    if (!decoded) {
      errors.push({
        code: AccountValidationCode.MALFORMED,
        message:
          'Destination is not a valid Stellar address (failed StrKey checksum/format validation).',
      });
      return { valid: false, address, type: null, network: options.network, errors };
    }

    if (!allowedTypes.includes(decoded.type)) {
      errors.push({
        code: AccountValidationCode.UNSUPPORTED_TYPE,
        message: `Account type ${decoded.type} is not accepted as a destination. Allowed: ${allowedTypes.join(', ')}.`,
      });
    }

    if (options.accountNetwork && options.accountNetwork !== options.network) {
      errors.push({
        code: AccountValidationCode.NETWORK_MISMATCH,
        message: `Destination account belongs to ${options.accountNetwork} but the transfer targets ${options.network}.`,
      });
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.logger.debug(`Destination validation failed for ${address}: ${errors.map((e) => e.code).join(',')}`);
    }
    return { valid, address, type: decoded.type, network: options.network, errors };
  }

  isValidAccountId(address: string): boolean {
    return (
      isValidEd25519PublicKey(address) ||
      isValidMuxedAccount(address) ||
      isValidContract(address)
    );
  }
}
