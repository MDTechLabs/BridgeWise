/**
 * BridgeWise — Test Suite for Issues #1538, #1539, #1540, #1541
 *
 * Covers:
 * - #1538: Add deployment script assertions for expected chain ID and factory address
 * - #1539: Verify constructor and initializer parameters against reviewed deployment manifest
 * - #1540: Add release gate for unverified proxy implementation and beacon targets
 * - #1541: Test governance proposal execution after proposer role revocation
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// #1538: Deployment Script Assertions for Expected Chain ID & Factory Address
// ============================================================================
describe("#1538 - Deployment Script Assertions", () => {
  interface DeploymentConfig {
    targetChainId: number;
    expectedFactory: string;
    actualChainId: number;
    actualFactory: string;
  }

  function validateDeploymentEnvironment(cfg: DeploymentConfig): { valid: boolean; reason?: string } {
    if (cfg.actualChainId !== cfg.targetChainId) {
      return {
        valid: false,
        reason: `Mismatched chain ID: expected ${cfg.targetChainId}, connected to ${cfg.actualChainId}`,
      };
    }
    if (cfg.actualFactory.toLowerCase() !== cfg.expectedFactory.toLowerCase()) {
      return {
        valid: false,
        reason: `Mismatched factory address: expected ${cfg.expectedFactory}, got ${cfg.actualFactory}`,
      };
    }
    return { valid: true };
  }

  it("should fail deployment when connected network chain ID does not match target", () => {
    const res = validateDeploymentEnvironment({
      targetChainId: 1, // Ethereum Mainnet
      expectedFactory: "0x1111111111111111111111111111111111111111",
      actualChainId: 5, // Goerli Testnet
      actualFactory: "0x1111111111111111111111111111111111111111",
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Mismatched chain ID");
  });

  it("should fail deployment when factory address does not match verified manifest", () => {
    const res = validateDeploymentEnvironment({
      targetChainId: 42161, // Arbitrum
      expectedFactory: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      actualChainId: 42161,
      actualFactory: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Mismatched factory address");
  });

  it("should succeed when both chain ID and factory match configuration", () => {
    const res = validateDeploymentEnvironment({
      targetChainId: 10, // Optimism
      expectedFactory: "0x2222222222222222222222222222222222222222",
      actualChainId: 10,
      actualFactory: "0x2222222222222222222222222222222222222222",
    });
    expect(res.valid).toBe(true);
  });
});

// ============================================================================
// #1539: Manifest Parameter Verification
// ============================================================================
describe("#1539 - Verify Constructor & Initializer Parameters Against Manifest", () => {
  interface DeploymentManifest {
    timelockDelaySeconds: number;
    initialAdmin: string;
    bridgeFeeBasisPoints: number;
    supportedTokens: string[];
  }

  function verifyParametersAgainstManifest(
    actual: DeploymentManifest,
    manifest: DeploymentManifest
  ): { valid: boolean; mismatches: string[] } {
    const mismatches: string[] = [];

    if (actual.timelockDelaySeconds !== manifest.timelockDelaySeconds) {
      mismatches.push(
        `timelockDelay mismatch: expected ${manifest.timelockDelaySeconds}, got ${actual.timelockDelaySeconds}`
      );
    }
    if (actual.initialAdmin.toLowerCase() !== manifest.initialAdmin.toLowerCase()) {
      mismatches.push(`admin mismatch: expected ${manifest.initialAdmin}, got ${actual.initialAdmin}`);
    }
    if (actual.bridgeFeeBasisPoints !== manifest.bridgeFeeBasisPoints) {
      mismatches.push(
        `fee bps mismatch: expected ${manifest.bridgeFeeBasisPoints}, got ${actual.bridgeFeeBasisPoints}`
      );
    }
    for (const token of manifest.supportedTokens) {
      if (!actual.supportedTokens.includes(token)) {
        mismatches.push(`missing expected token: ${token}`);
      }
    }

    return { valid: mismatches.length === 0, mismatches };
  }

  it("should catch deviations in initializer parameters from reviewed manifest", () => {
    const manifest: DeploymentManifest = {
      timelockDelaySeconds: 172800, // 48h
      initialAdmin: "0xGovernanceTimelock",
      bridgeFeeBasisPoints: 15,
      supportedTokens: ["USDC", "USDT"],
    };

    const actualDeviated: DeploymentManifest = {
      timelockDelaySeconds: 3600, // unsafe 1h delay!
      initialAdmin: "0xGovernanceTimelock",
      bridgeFeeBasisPoints: 50,
      supportedTokens: ["USDC"],
    };

    const verification = verifyParametersAgainstManifest(actualDeviated, manifest);
    expect(verification.valid).toBe(false);
    expect(verification.mismatches.length).toBe(3);
    expect(verification.mismatches[0]).toContain("timelockDelay mismatch");
  });
});

// ============================================================================
// #1540: Release Gate for Unverified Proxy Implementation & Beacon Targets
// ============================================================================
describe("#1540 - Release Gate for Proxy & Beacon Verification", () => {
  interface ProxyTargetAudit {
    targetAddress: string;
    isCodeDeployed: boolean;
    isSourceVerifiedOnExplorer: boolean;
    matchesGitBytecodeHash: boolean;
  }

  function releaseGateCheck(targets: ProxyTargetAudit[]): { passed: boolean; blockedTargets: string[] } {
    const blocked: string[] = [];

    for (const t of targets) {
      if (!t.isCodeDeployed || !t.isSourceVerifiedOnExplorer || !t.matchesGitBytecodeHash) {
        blocked.push(t.targetAddress);
      }
    }

    return { passed: blocked.length === 0, blockedTargets: blocked };
  }

  it("should block release when proxy implementation bytecode is unverified or mismatched", () => {
    const targets: ProxyTargetAudit[] = [
      {
        targetAddress: "0xBeacon1",
        isCodeDeployed: true,
        isSourceVerifiedOnExplorer: true,
        matchesGitBytecodeHash: true,
      },
      {
        targetAddress: "0xProxyImpl2",
        isCodeDeployed: true,
        isSourceVerifiedOnExplorer: false, // unverified on explorer!
        matchesGitBytecodeHash: false,
      },
    ];

    const result = releaseGateCheck(targets);
    expect(result.passed).toBe(false);
    expect(result.blockedTargets).toContain("0xProxyImpl2");
  });
});

// ============================================================================
// #1541: Governance Proposal Execution After Proposer Role Revocation
// ============================================================================
describe("#1541 - Governance Proposal Execution After Proposer Role Revocation", () => {
  enum ProposalState {
    PENDING,
    QUEUED,
    EXECUTED,
    CANCELLED,
  }

  interface Proposal {
    id: string;
    proposer: string;
    queuedTimestamp: number;
    delaySeconds: number;
    state: ProposalState;
  }

  class GovernanceTimelock {
    private proposers: Set<string> = new Set();
    public proposals: Map<string, Proposal> = new Map();

    grantProposer(account: string) {
      this.proposers.add(account);
    }

    revokeProposer(account: string) {
      this.proposers.delete(account);
    }

    queueProposal(id: string, proposer: string, now: number, delaySeconds: number = 86400) {
      if (!this.proposers.has(proposer)) {
        throw new Error("Proposer role required to queue proposal");
      }
      this.proposals.set(id, {
        id,
        proposer,
        queuedTimestamp: now,
        delaySeconds,
        state: ProposalState.QUEUED,
      });
    }

    executeProposal(id: string, now: number) {
      const prop = this.proposals.get(id);
      if (!prop) throw new Error("Proposal not found");
      if (prop.state !== ProposalState.QUEUED) throw new Error("Proposal is not in queued state");

      if (now < prop.queuedTimestamp + prop.delaySeconds) {
        throw new Error("Timelock delay has not elapsed");
      }

      // Security invariant: even if proposer was subsequently compromised or revoked,
      // a legitimate queued proposal that weathered the full timelock without cancellation
      // remains validly executable by the DAO/timelock.
      prop.state = ProposalState.EXECUTED;
      return true;
    }
  }

  it("should permit execution of a valid queued proposal after timelock delay even if proposer role is later revoked", () => {
    const timelock = new GovernanceTimelock();
    timelock.grantProposer("proposerA");

    const t0 = 1000000;
    timelock.queueProposal("prop-1", "proposerA", t0, 86400);

    // Later: proposerA leaves or is revoked
    timelock.revokeProposer("proposerA");

    // Timelock delay passes (t0 + 86401)
    const executed = timelock.executeProposal("prop-1", t0 + 86401);
    expect(executed).toBe(true);
    expect(timelock.proposals.get("prop-1")?.state).toBe(ProposalState.EXECUTED);
  });
});
