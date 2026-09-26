import { ApprovedFingerprintStore } from '../../security/contracts/fingerprints/approved-fingerprint-store';
import {
  computeDeploymentFingerprint,
  shortFingerprint,
} from '../../security/contracts/fingerprints/deployment-fingerprint';
import {
  ApprovedFingerprint,
  DeploymentFingerprint,
  DeploymentObservation,
  MismatchReason,
  VerificationResult,
  VerificationStatus,
} from '../../security/contracts/fingerprints/types';

/**
 * Checks an observed Soroban deployment against the approved fingerprints.
 *
 * The three failure modes are kept distinct because they call for different
 * responses: an unknown contract needs an approval decision, a mismatch needs
 * investigation, and a revoked deployment needs the integration stopped.
 */
export class SorobanDeploymentVerifier {
  constructor(private readonly store: ApprovedFingerprintStore) {}

  verify(
    observation: DeploymentObservation,
    now: number = Date.now(),
  ): VerificationResult {
    const observed = computeDeploymentFingerprint(observation, now);
    const { contractAddress, network } = observed;

    const match = this.store.find(
      contractAddress,
      network,
      observed.fingerprint,
    );

    if (match && !match.revokedAt) {
      return {
        contractAddress,
        network,
        status: VerificationStatus.APPROVED,
        observed,
        matched: match,
        reasons: [],
        differences: [],
        verifiedAt: now,
      };
    }

    if (match?.revokedAt) {
      return {
        contractAddress,
        network,
        status: VerificationStatus.REVOKED,
        observed,
        matched: match,
        reasons: [MismatchReason.FINGERPRINT_REVOKED],
        differences: [
          match.revokedReason
            ? `Deployment was revoked: ${match.revokedReason}`
            : 'Deployment was revoked',
        ],
        verifiedAt: now,
      };
    }

    const comparedAgainst = this.store.latestActive(contractAddress, network);

    if (!comparedAgainst) {
      return {
        contractAddress,
        network,
        status: VerificationStatus.UNKNOWN,
        observed,
        reasons: [MismatchReason.NO_APPROVED_FINGERPRINT],
        differences: [
          `No approved fingerprint recorded for ${contractAddress} on ${network}`,
        ],
        verifiedAt: now,
      };
    }

    const { reasons, differences } = diffFingerprints(
      comparedAgainst.details,
      observed,
    );

    return {
      contractAddress,
      network,
      status: VerificationStatus.MISMATCH,
      observed,
      comparedAgainst,
      reasons,
      differences,
      verifiedAt: now,
    };
  }

  verifyMany(
    observations: DeploymentObservation[],
    now: number = Date.now(),
  ): VerificationResult[] {
    return observations.map((observation) => this.verify(observation, now));
  }

  /** True only for an active, matching approval. */
  isVerified(
    observation: DeploymentObservation,
    now: number = Date.now(),
  ): boolean {
    return this.verify(observation, now).status === VerificationStatus.APPROVED;
  }

  /** Record the observed deployment as the approved one. */
  approve(
    observation: DeploymentObservation,
    options: {
      label?: string;
      approvedBy?: string;
      notes?: string;
      now?: number;
    } = {},
  ): ApprovedFingerprint {
    const now = options.now ?? Date.now();

    return this.store.approve({
      details: computeDeploymentFingerprint(observation, now),
      label: options.label,
      approvedBy: options.approvedBy,
      notes: options.notes,
      approvedAt: now,
    });
  }
}

/** Why two fingerprints differ, in terms an operator can act on. */
export function diffFingerprints(
  approved: DeploymentFingerprint,
  observed: DeploymentFingerprint,
): { reasons: MismatchReason[]; differences: string[] } {
  const reasons: MismatchReason[] = [];
  const differences: string[] = [];

  if (approved.wasmHash !== observed.wasmHash) {
    reasons.push(MismatchReason.WASM_HASH_CHANGED);
    differences.push(
      `Wasm hash ${shortFingerprint(approved.wasmHash)} → ${shortFingerprint(observed.wasmHash)}`,
    );
  }

  if (approved.interfaceDigest !== observed.interfaceDigest) {
    reasons.push(MismatchReason.INTERFACE_CHANGED);
    differences.push(
      `Interface digest ${shortFingerprint(approved.interfaceDigest)} → ${shortFingerprint(observed.interfaceDigest)}`,
    );
  }

  if ((approved.specVersion ?? '') !== (observed.specVersion ?? '')) {
    reasons.push(MismatchReason.SPEC_VERSION_CHANGED);
    differences.push(
      `Spec version ${approved.specVersion ?? 'none'} → ${observed.specVersion ?? 'none'}`,
    );
  }

  return { reasons, differences };
}
