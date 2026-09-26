/**
 * MultiSig Control Service
 * 
 * Manages M-of-N multisignature administration for privileged bridge operations,
 * configuration updates, and treasury management.
 */

export interface MultiSigConfig {
  owners: string[];
  requiredThreshold: number;
  proposalTTLMs: number; // Expiration window in milliseconds
}

export interface MultiSigProposal {
  id: string;
  targetContract: string;
  operationName: string;
  params: Record<string, unknown>;
  proposer: string;
  confirmations: Set<string>;
  executed: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface ProposalResult {
  success: boolean;
  proposalId?: string;
  error?: string;
}

export class MultiSigControlService {
  private owners: Set<string>;
  private requiredThreshold: number;
  private proposalTTLMs: number;
  private proposals: Map<string, MultiSigProposal> = new Map();

  constructor(config: MultiSigConfig) {
    if (!config.owners || config.owners.length === 0) {
      throw new Error('At least one owner is required for MultiSigControlService');
    }
    if (config.requiredThreshold <= 0 || config.requiredThreshold > config.owners.length) {
      throw new Error(`Invalid threshold ${config.requiredThreshold} for owner count ${config.owners.length}`);
    }

    this.owners = new Set(config.owners.map((o) => o.toLowerCase()));
    this.requiredThreshold = config.requiredThreshold;
    this.proposalTTLMs = config.proposalTTLMs ?? 86400000; // Default 24h
  }

  /**
   * Check if an address is an authorized multisig owner.
   */
  public isOwner(address: string): boolean {
    return this.owners.has(address.toLowerCase());
  }

  /**
   * Propose a new administrative operation requiring multisig approval.
   */
  public propose(
    proposer: string,
    targetContract: string,
    operationName: string,
    params: Record<string, unknown>
  ): ProposalResult {
    const normProposer = proposer.toLowerCase();
    if (!this.isOwner(normProposer)) {
      return { success: false, error: `Address ${proposer} is not an authorized multisig owner` };
    }

    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const proposal: MultiSigProposal = {
      id: proposalId,
      targetContract,
      operationName,
      params,
      proposer: normProposer,
      confirmations: new Set([normProposer]), // Proposer automatically confirms
      executed: false,
      createdAt: now,
      expiresAt: now + this.proposalTTLMs,
    };

    this.proposals.set(proposalId, proposal);
    return { success: true, proposalId };
  }

  /**
   * Confirm (sign) a pending multisig proposal.
   */
  public confirm(signer: string, proposalId: string): ProposalResult {
    const normSigner = signer.toLowerCase();
    if (!this.isOwner(normSigner)) {
      return { success: false, error: `Address ${signer} is not an authorized multisig owner` };
    }

    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, error: `Proposal ${proposalId} not found` };
    }

    if (proposal.executed) {
      return { success: false, error: `Proposal ${proposalId} has already been executed` };
    }

    if (Date.now() > proposal.expiresAt) {
      return { success: false, error: `Proposal ${proposalId} has expired` };
    }

    if (proposal.confirmations.has(normSigner)) {
      return { success: false, error: `Signer ${signer} has already confirmed proposal ${proposalId}` };
    }

    proposal.confirmations.add(normSigner);
    return { success: true, proposalId };
  }

  /**
   * Revoke confirmation for a pending proposal.
   */
  public revoke(signer: string, proposalId: string): ProposalResult {
    const normSigner = signer.toLowerCase();
    const proposal = this.proposals.get(proposalId);
    
    if (!proposal) {
      return { success: false, error: `Proposal ${proposalId} not found` };
    }

    if (proposal.executed) {
      return { success: false, error: `Proposal ${proposalId} has already been executed` };
    }

    if (!proposal.confirmations.has(normSigner)) {
      return { success: false, error: `Signer ${signer} has not confirmed proposal ${proposalId}` };
    }

    proposal.confirmations.delete(normSigner);
    return { success: true, proposalId };
  }

  /**
   * Execute a multisig proposal if signature threshold is satisfied.
   */
  public execute(executor: string, proposalId: string): ProposalResult {
    const normExecutor = executor.toLowerCase();
    if (!this.isOwner(normExecutor)) {
      return { success: false, error: `Address ${executor} is not an authorized multisig owner` };
    }

    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, error: `Proposal ${proposalId} not found` };
    }

    if (proposal.executed) {
      return { success: false, error: `Proposal ${proposalId} has already been executed` };
    }

    if (Date.now() > proposal.expiresAt) {
      return { success: false, error: `Proposal ${proposalId} has expired` };
    }

    if (proposal.confirmations.size < this.requiredThreshold) {
      return {
        success: false,
        error: `Insufficient confirmations: ${proposal.confirmations.size}/${this.requiredThreshold} required`,
      };
    }

    proposal.executed = true;
    return { success: true, proposalId };
  }

  /**
   * Get proposal details by ID.
   */
  public getProposal(proposalId: string): MultiSigProposal | undefined {
    const p = this.proposals.get(proposalId);
    if (!p) return undefined;

    return {
      ...p,
      confirmations: new Set(p.confirmations),
    };
  }

  /**
   * Get all active proposals.
   */
  public getActiveProposals(): MultiSigProposal[] {
    const now = Date.now();
    return Array.from(this.proposals.values()).filter(
      (p) => !p.executed && p.expiresAt >= now
    );
  }

  /**
   * Get threshold & owner status.
   */
  public getGovernanceInfo(): { ownersCount: number; requiredThreshold: number } {
    return {
      ownersCount: this.owners.size,
      requiredThreshold: this.requiredThreshold,
    };
  }
}
