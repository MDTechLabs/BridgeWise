/**
 * Self-contained Stellar StrKey validation (base32 + CRC16-XModem checksum).
 *
 * A StrKey is the base32 encoding of:
 *   [1-byte version][payload][2-byte little-endian CRC16-XModem checksum]
 *
 * We implement decoding here rather than importing the Stellar SDK so the
 * validator has no heavy runtime dependency and always compiles cleanly.
 */

export enum StrKeyType {
  ED25519_PUBLIC_KEY = 'ED25519_PUBLIC_KEY',
  MUXED_ACCOUNT = 'MUXED_ACCOUNT',
  CONTRACT = 'CONTRACT',
}

// Version bytes: (typeValue << 3). See SEP-0023 / strkey spec.
const VERSION_BYTES: Record<StrKeyType, number> = {
  [StrKeyType.ED25519_PUBLIC_KEY]: 6 << 3, // 'G'
  [StrKeyType.MUXED_ACCOUNT]: 12 << 3, // 'M'
  [StrKeyType.CONTRACT]: 2 << 3, // 'C'
};

const EXPECTED_PAYLOAD_LENGTH: Record<StrKeyType, number> = {
  [StrKeyType.ED25519_PUBLIC_KEY]: 32,
  [StrKeyType.MUXED_ACCOUNT]: 40, // 32-byte ed25519 + 8-byte id
  [StrKeyType.CONTRACT]: 32,
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const ch of input) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    let code = (crc >>> 8) & 0xff;
    code ^= byte & 0xff;
    code ^= code >>> 4;
    crc = (crc << 8) & 0xffff;
    crc ^= code;
    code = (code << 5) & 0xffff;
    crc ^= code;
    code = (code << 7) & 0xffff;
    crc ^= code;
  }
  return crc & 0xffff;
}

export interface DecodedStrKey {
  type: StrKeyType;
  payload: Uint8Array;
}

/** Decode and verify a StrKey, returning its type + payload, or null if invalid. */
export function decodeStrKey(address: string): DecodedStrKey | null {
  if (typeof address !== 'string' || address.length === 0) return null;
  // StrKeys are unpadded base32 of uppercase A-Z2-7 only.
  if (!/^[A-Z2-7]+$/.test(address)) return null;

  const decoded = base32Decode(address);
  if (!decoded || decoded.length < 3) return null;

  const versionByte = decoded[0];
  const type = (Object.keys(VERSION_BYTES) as StrKeyType[]).find(
    (t) => VERSION_BYTES[t] === versionByte,
  );
  if (!type) return null;

  const payload = decoded.slice(1, decoded.length - 2);
  if (payload.length !== EXPECTED_PAYLOAD_LENGTH[type]) return null;

  const checksum = decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
  const expected = crc16xmodem(decoded.slice(0, decoded.length - 2));
  if (checksum !== expected) return null;

  return { type, payload };
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/** Encode a payload into a StrKey of the given type (inverse of decodeStrKey). */
export function encodeStrKey(type: StrKeyType, payload: Uint8Array): string {
  const versioned = new Uint8Array(1 + payload.length + 2);
  versioned[0] = VERSION_BYTES[type];
  versioned.set(payload, 1);
  const checksum = crc16xmodem(versioned.slice(0, 1 + payload.length));
  versioned[1 + payload.length] = checksum & 0xff;
  versioned[1 + payload.length + 1] = (checksum >>> 8) & 0xff;
  return base32Encode(versioned);
}

export function isValidEd25519PublicKey(address: string): boolean {
  const decoded = decodeStrKey(address);
  return decoded?.type === StrKeyType.ED25519_PUBLIC_KEY;
}

export function isValidMuxedAccount(address: string): boolean {
  const decoded = decodeStrKey(address);
  return decoded?.type === StrKeyType.MUXED_ACCOUNT;
}

export function isValidContract(address: string): boolean {
  const decoded = decodeStrKey(address);
  return decoded?.type === StrKeyType.CONTRACT;
}
