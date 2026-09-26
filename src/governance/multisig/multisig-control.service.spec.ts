import { MultiSigControlService } from './multisig-control.service';

describe('MultiSigControlService', () => {
  let service: MultiSigControlService;
  const owner1 = '0x1111111111111111111111111111111111111111';
  const owner2 = '0x2222222222222222222222222222222222222222';
  const owner3 = '0x3333333333333333333333333333333333333333';
  const nonOwner = '0x9999999999999999999999999999999999999999';

  beforeEach(() => {
    service = new MultiSigControlService({
      owners: [owner1, owner2, owner3],
      requiredThreshold: 2, // 2-of-3 multisig
      proposalTTLMs: 3600000, // 1h
    });
  });

  it('should initialize with valid owners and threshold', () => {
    const info = service.getGovernanceInfo();
    expect(info.ownersCount).toBe(3);
    expect(info.requiredThreshold).toBe(2);
    expect(service.isOwner(owner1)).toBe(true);
    expect(service.isOwner(nonOwner)).toBe(false);
  });

  it('should allow owner to propose administrative action', () => {
    const result = service.propose(owner1, '0xBridgeConfig', 'setFee', { newFeeBps: 15 });
    expect(result.success).toBe(true);
    expect(result.proposalId).toBeDefined();

    const proposal = service.getProposal(result.proposalId!);
    expect(proposal?.targetContract).toBe('0xBridgeConfig');
    expect(proposal?.operationName).toBe('setFee');
    expect(proposal?.confirmations.size).toBe(1);
    expect(proposal?.confirmations.has(owner1.toLowerCase())).toBe(true);
  });

  it('should reject proposals from non-owners', () => {
    const result = service.propose(nonOwner, '0xBridgeConfig', 'setFee', { newFeeBps: 15 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('is not an authorized multisig owner');
  });

  it('should allow second owner to confirm proposal and meet threshold', () => {
    const propResult = service.propose(owner1, '0xBridgeConfig', 'pauseBridge', {});
    const proposalId = propResult.proposalId!;

    const confirmResult = service.confirm(owner2, proposalId);
    expect(confirmResult.success).toBe(true);

    const proposal = service.getProposal(proposalId);
    expect(proposal?.confirmations.size).toBe(2);

    // Try executing with owner3
    const execResult = service.execute(owner3, proposalId);
    expect(execResult.success).toBe(true);

    const executedProp = service.getProposal(proposalId);
    expect(executedProp?.executed).toBe(true);
  });

  it('should reject execution when threshold is not met', () => {
    const propResult = service.propose(owner1, '0xBridgeConfig', 'updateTreasury', {});
    const proposalId = propResult.proposalId!;

    // Currently only 1 confirmation (owner1) but 2 are required
    const execResult = service.execute(owner1, proposalId);
    expect(execResult.success).toBe(false);
    expect(execResult.error).toContain('Insufficient confirmations');
  });

  it('should support confirmation revocation before execution', () => {
    const propResult = service.propose(owner1, '0xBridgeConfig', 'updateTreasury', {});
    const proposalId = propResult.proposalId!;

    service.confirm(owner2, proposalId);
    expect(service.getProposal(proposalId)?.confirmations.size).toBe(2);

    const revokeResult = service.revoke(owner2, proposalId);
    expect(revokeResult.success).toBe(true);
    expect(service.getProposal(proposalId)?.confirmations.size).toBe(1);
  });
});
