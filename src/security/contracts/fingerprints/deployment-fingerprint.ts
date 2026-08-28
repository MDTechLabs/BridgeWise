import { createHash } from 'crypto';
import {
  ContractInterfaceSurface,
  DeploymentFingerprint,
  DeploymentObservation,
  EMPTY_INTERFACE,
  FingerprintNetwork,
} from './types';

/**
 * Deterministic fingerprinting of Soroban deployments.
 *
 * Determinism is the whole point: the same deployment observed from two
 * different nodes, at different times, in a different field order, must
 * produce the same string — otherwise every comparison is a false alarm.
 */

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Contract addresses are upper-case base32; normalize so case cannot fork identity. */
export function normalizeContractAddress(address: string): string {
  const normalized = address?.trim().toUpperCase();

  if (!normalized) {
    throw new Error('Contract address is required to fingerprint a deployment');
  }

  return normalized;
}

/**
 * Wasm hashes are hex. A non-hex value (a base64 hash, a truncated log line)
 * would still fingerprint cleanly and then never match anything, so it is
 * rejected at the door rather than becoming a silent permanent mismatch.
 */
export function normalizeWasmHash(wasmHash: string): string {
  const normalized = wasmHash?.trim().toLowerCase().replace(/^0x/, '');

  if (!normalized) {
    throw new Error('Wasm hash is required to fingerprint a deployment');
  }

  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`Wasm hash must be hex encoded, received: ${wasmHash}`);
  }

  return normalized;
}

/**
 * Sort and de-duplicate the interface surface.
 *
 * Two nodes can enumerate a contract spec in different orders; that is not an
 * interface change and must not read as one.
 */
export function canonicalizeInterface(
  surface: ContractInterfaceSurface = EMPTY_INTERFACE,
): ContractInterfaceSurface {
  const unique = (values: string[] = []) =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

  return {
    functions: unique(surface.functions),
    events: unique(surface.events),
    errors: [...new Set(surface.errors ?? [])].sort((a, b) => a - b),
  };
}

export function computeInterfaceDigest(
  surface?: ContractInterfaceSurface,
): string {
  const canonical = canonicalizeInterface(surface);

  return sha256(
    JSON.stringify([canonical.functions, canonical.events, canonical.errors]),
  );
}

/** Digest of an empty surface — what a deployment with no known spec fingerprints as. */
export const EMPTY_INTERFACE_DIGEST = computeInterfaceDigest(EMPTY_INTERFACE);

/**
 * The identity payload.
 *
 * An array rather than a delimited string: with `address|network|hash`, an
 * address containing the delimiter could impersonate another deployment.
 * JSON of a fixed-length array has no such ambiguity.
 */
function identityPayload(
  contractAddress: string,
  network: FingerprintNetwork,
  wasmHash: string,
  specVersion: string,
  interfaceDigest: string,
): string {
  return JSON.stringify([
    contractAddress,
    network,
    wasmHash,
    specVersion,
    interfaceDigest,
  ]);
}

export function computeDeploymentFingerprint(
  observation: DeploymentObservation,
  now: number = Date.now(),
): DeploymentFingerprint {
  const contractAddress = normalizeContractAddress(observation.contractAddress);
  const wasmHash = normalizeWasmHash(observation.wasmHash);
  const network = observation.network;

  if (!network) {
    throw new Error('Network is required to fingerprint a deployment');
  }

  const specVersion = observation.specVersion?.trim() ?? '';
  const interfaceDigest = computeInterfaceDigest(observation.interface);

  return {
    fingerprint: sha256(
      identityPayload(
        contractAddress,
        network,
        wasmHash,
        specVersion,
        interfaceDigest,
      ),
    ),
    contractAddress,
    network,
    wasmHash,
    specVersion: specVersion || undefined,
    interfaceDigest,
    computedAt: now,
  };
}

export function fingerprintsMatch(
  left: DeploymentFingerprint,
  right: DeploymentFingerprint,
): boolean {
  return left.fingerprint === right.fingerprint;
}

/** Key under which a contract's approvals are grouped — network-scoped by design. */
export function contractKey(
  contractAddress: string,
  network: FingerprintNetwork,
): string {
  return `${network}:${normalizeContractAddress(contractAddress)}`;
}

/** Short form for log lines and alert messages. */
export function shortFingerprint(fingerprint: string, length = 12): string {
  return fingerprint.slice(0, length);
}
