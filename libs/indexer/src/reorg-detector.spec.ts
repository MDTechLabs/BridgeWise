import { ReorgDetector, BlockHeader, ReorgEvent, ContinuityBreakEvent, ChainReorgError } from './reorg-detector';
import { FinalityTracker, defaultFinalityConfigs, RollbackEvent } from './finality-tracker';

describe('ReorgDetector and FinalityTracker', () => {
  it('should detect a block hash mutation and trigger a re-org rollback', () => {
    const detector = new ReorgDetector({ chainId: 1, historyDepth: 10 });
    const tracker = new FinalityTracker(defaultFinalityConfigs());

    const reorgEvents: ReorgEvent[] = [];
    const rollbacks: RollbackEvent[] = [];

    detector.on('reorg', (event: ReorgEvent) => reorgEvents.push(event));
    tracker.on('rolledBack', (event: RollbackEvent) => rollbacks.push(event));

    // 1. Feed initial valid blocks
    const b1: BlockHeader = { chainId: 1, height: 1, hash: '0x111', parentHash: '0x000', timestamp: Date.now() };
    const b2: BlockHeader = { chainId: 1, height: 2, hash: '0x222', parentHash: '0x111', timestamp: Date.now() };

    detector.processBlock(b1);
    detector.processBlock(b2);

    // Quarantine a message tied to block height 2
    tracker.quarantineMessage({
      messageId: 'msg-1',
      sourceChainId: 1,
      sourceBlockHeight: 2,
      sourceBlockHash: '0x222',
      payload: { amount: 100 },
    });

    // Hook tracker to detector reorg events
    detector.on('reorg', (event: ReorgEvent) => tracker.handleReorg(event));

    // 2. Feed a conflicting block at height 2 (re-org mutation)
    const b2Alt: BlockHeader = { chainId: 1, height: 2, hash: '0x222-alt', parentHash: '0x111', timestamp: Date.now() };
    detector.processBlock(b2Alt);

    expect(reorgEvents.length).toBe(1);
    expect(reorgEvents[0].invalidatedHeights).toContain(2);
    expect(rollbacks.length).toBe(1);
    expect(rollbacks[0].message.messageId).toBe('msg-1');
  });

  it('should emit a continuityBreak when a block arrives whose parent is unknown', () => {
    // tolerateUnknownParent: true so the detector reports the break instead of throwing,
    // which is the mode you'd use on a live indexer that must keep running.
    const detector = new ReorgDetector({ chainId: 1, historyDepth: 10, tolerateUnknownParent: true });

    const breaks: ContinuityBreakEvent[] = [];
    detector.on('continuityBreak', (event: ContinuityBreakEvent) => breaks.push(event));

    const b1: BlockHeader = { chainId: 1, height: 1, hash: '0x111', parentHash: '0x000', timestamp: Date.now() };
    detector.processBlock(b1);

    // Height 5 arrives with a parentHash that doesn't match anything in history
    // (a gap: heights 2-4 were never seen, and the claimed parent is unrecognized).
    const b5: BlockHeader = {
      chainId: 1,
      height: 5,
      hash: '0x555',
      parentHash: '0xdeadbeef',
      timestamp: Date.now(),
    };
    detector.processBlock(b5);

    expect(breaks.length).toBe(1);
    expect(breaks[0].atHeight).toBe(5);
    expect(breaks[0].receivedParentHash).toBe('0xdeadbeef');
  });

  it('should throw ChainReorgError on continuity break when tolerateUnknownParent is false (default)', () => {
    const detector = new ReorgDetector({ chainId: 1, historyDepth: 10 });

    const b1: BlockHeader = { chainId: 1, height: 1, hash: '0x111', parentHash: '0x000', timestamp: Date.now() };
    detector.processBlock(b1);

    const b5: BlockHeader = {
      chainId: 1,
      height: 5,
      hash: '0x555',
      parentHash: '0xdeadbeef',
      timestamp: Date.now(),
    };

    expect(() => detector.processBlock(b5)).toThrow(ChainReorgError);
  });
});