import { contractKey } from './deployment-fingerprint';
import {
  ApproveFingerprintInput,
  ApprovedFingerprint,
  FingerprintNetwork,
} from './types';

/**
 * Storage for the deployments an operator has approved.
 *
 * In memory by design — persistence differs per deployment target, so the
 * store exposes `snapshot()` / `restore()` and leaves the medium to the
 * caller rather than assuming a database.
 */
export class ApprovedFingerprintStore {
  private readonly byContract = new Map<string, ApprovedFingerprint[]>();

  /**
   * Approve a deployment.
   *
   * Re-approving the same fingerprint updates the existing record instead of
   * adding a duplicate — and un-revokes it, since approving something that was
   * revoked is an explicit decision to trust it again.
   */
  approve(input: ApproveFingerprintInput): ApprovedFingerprint {
    const { details } = input;
    const key = contractKey(details.contractAddress, details.network);
    const existing = this.byContract.get(key) ?? [];
    const previous = existing.find(
      (entry) => entry.fingerprint === details.fingerprint,
    );

    const record: ApprovedFingerprint = {
      fingerprint: details.fingerprint,
      contractAddress: details.contractAddress,
      network: details.network,
      details,
      label: input.label ?? previous?.label,
      approvedAt: input.approvedAt ?? Date.now(),
      approvedBy: input.approvedBy ?? previous?.approvedBy,
      notes: input.notes ?? previous?.notes,
    };

    this.byContract.set(
      key,
      previous
        ? existing.map((entry) =>
            entry.fingerprint === record.fingerprint ? record : entry,
          )
        : [...existing, record],
    );

    return record;
  }

  /** Every approval recorded for a contract, revoked ones included. */
  listForContract(
    contractAddress: string,
    network: FingerprintNetwork,
  ): ApprovedFingerprint[] {
    return [
      ...(this.byContract.get(contractKey(contractAddress, network)) ?? []),
    ];
  }

  listActiveForContract(
    contractAddress: string,
    network: FingerprintNetwork,
  ): ApprovedFingerprint[] {
    return this.listForContract(contractAddress, network).filter(
      (entry) => !entry.revokedAt,
    );
  }

  find(
    contractAddress: string,
    network: FingerprintNetwork,
    fingerprint: string,
  ): ApprovedFingerprint | undefined {
    return this.listForContract(contractAddress, network).find(
      (entry) => entry.fingerprint === fingerprint,
    );
  }

  isApproved(
    contractAddress: string,
    network: FingerprintNetwork,
    fingerprint: string,
  ): boolean {
    const entry = this.find(contractAddress, network, fingerprint);

    return Boolean(entry && !entry.revokedAt);
  }

  /** The approval to compare a mismatch against — the most recently approved active one. */
  latestActive(
    contractAddress: string,
    network: FingerprintNetwork,
  ): ApprovedFingerprint | undefined {
    return this.listActiveForContract(contractAddress, network).sort(
      (a, b) => b.approvedAt - a.approvedAt,
    )[0];
  }

  /**
   * Withdraw trust from a deployment.
   *
   * The record is kept rather than deleted: "this was approved and then
   * revoked" is a different, more useful answer than "never heard of it".
   */
  revoke(
    contractAddress: string,
    network: FingerprintNetwork,
    fingerprint: string,
    reason?: string,
    revokedAt: number = Date.now(),
  ): ApprovedFingerprint | undefined {
    const entry = this.find(contractAddress, network, fingerprint);

    if (!entry) return undefined;

    const revoked: ApprovedFingerprint = {
      ...entry,
      revokedAt,
      revokedReason: reason,
    };
    const key = contractKey(contractAddress, network);

    this.byContract.set(
      key,
      (this.byContract.get(key) ?? []).map((item) =>
        item.fingerprint === fingerprint ? revoked : item,
      ),
    );

    return revoked;
  }

  remove(
    contractAddress: string,
    network: FingerprintNetwork,
    fingerprint: string,
  ): boolean {
    const key = contractKey(contractAddress, network);
    const existing = this.byContract.get(key) ?? [];
    const remaining = existing.filter(
      (entry) => entry.fingerprint !== fingerprint,
    );

    if (remaining.length === existing.length) return false;

    if (remaining.length === 0) {
      this.byContract.delete(key);
    } else {
      this.byContract.set(key, remaining);
    }

    return true;
  }

  size(): number {
    return [...this.byContract.values()].reduce(
      (total, list) => total + list.length,
      0,
    );
  }

  clear(): void {
    this.byContract.clear();
  }

  /** Flat list for persistence. */
  snapshot(): ApprovedFingerprint[] {
    return [...this.byContract.values()].flat();
  }

  /** Replace the contents from a previous snapshot. */
  restore(entries: ApprovedFingerprint[]): void {
    this.byContract.clear();

    for (const entry of entries) {
      const key = contractKey(entry.contractAddress, entry.network);

      this.byContract.set(key, [...(this.byContract.get(key) ?? []), entry]);
    }
  }
}
