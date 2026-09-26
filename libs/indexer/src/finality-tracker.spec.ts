import { FinalityTracker, CrossChainMessage, ReleaseEvent, QuarantinedMessage } from './finality-tracker';

describe('FinalityTracker', () => {
  it('should quarantine a message and release it once it reaches the required confirmation depth', () => {
    // Use a small custom threshold (3 blocks) instead of the real Ethereum/Polygon
    // defaults so the test doesn't need to simulate dozens of blocks.
    const tracker = new FinalityTracker([{ chainId: 999, requiredConfirmations: 3, label: 'TestChain' }]);

    const quarantined: QuarantinedMessage[] = [];
    const released: ReleaseEvent[] = [];
    tracker.on('quarantined', (entry) => quarantined.push(entry));
    tracker.on('released', (event) => released.push(event));

    const message: CrossChainMessage = {
      messageId: 'msg-final-1',
      sourceChainId: 999,
      sourceBlockHeight: 100,
      sourceBlockHash: '0xabc',
      payload: { amount: 50 },
    };

    tracker.quarantineMessage(message);
    expect(quarantined.length).toBe(1);
    expect(tracker.getStatus('msg-final-1')?.status).toBe('pending');

    // Head at 100: confirmations = 1 (not yet final for a 3-block requirement)
    tracker.advanceHead(999, 100);
    expect(released.length).toBe(0);
    expect(tracker.getStatus('msg-final-1')?.status).toBe('pending');

    // Head at 101: confirmations = 2 (still not final)
    tracker.advanceHead(999, 101);
    expect(released.length).toBe(0);

    // Head at 102: confirmations = 3 (meets the threshold -> release)
    tracker.advanceHead(999, 102);
    expect(released.length).toBe(1);
    expect(released[0].message.messageId).toBe('msg-final-1');
    expect(released[0].confirmations).toBe(3);

    // Once released, the message is no longer sitting in quarantine.
    expect(tracker.getStatus('msg-final-1')).toBeUndefined();
    expect(tracker.getPendingMessages(999)).toHaveLength(0);
  });

  it('should not release a message before it reaches the required confirmation depth', () => {
    const tracker = new FinalityTracker([{ chainId: 999, requiredConfirmations: 10 }]);

    const message: CrossChainMessage = {
      messageId: 'msg-final-2',
      sourceChainId: 999,
      sourceBlockHeight: 50,
      sourceBlockHash: '0xdef',
      payload: { amount: 10 },
    };

    tracker.quarantineMessage(message);
    tracker.advanceHead(999, 55); // only 6 confirmations, threshold is 10

    expect(tracker.getStatus('msg-final-2')?.status).toBe('pending');
    expect(tracker.getPendingMessages(999)).toHaveLength(1);
  });
});