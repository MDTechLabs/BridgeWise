import { InMemoryNonceStore } from '../in-memory-nonce-store';

describe('InMemoryNonceStore', () => {
  it('starts empty', async () => {
    const store = new InMemoryNonceStore();
    expect(await store.getNonce('ethereum')).toBeNull();
    expect(await store.getMessageNonce('m1')).toBeNull();
    expect(store.getStats()).toEqual({ chains: 0, messages: 0, evicted: 0 });
  });

  it('round-trips a per-chain nonce', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 3);
    await store.setNonce('stellar', 1);
    expect(await store.getNonce('ethereum')).toBe(3);
    expect(await store.getNonce('stellar')).toBe(1);
    expect(await store.getNonce('solana')).toBeNull();
    expect(store.getStats()).toEqual({ chains: 2, messages: 0, evicted: 0 });
  });

  it('round-trips a message nonce pin and removal', async () => {
    const store = new InMemoryNonceStore();
    await store.setMessageNonce('m1', 'ethereum', 4);
    expect(await store.getMessageNonce('m1')).toEqual({ chainId: 'ethereum', nonce: 4 });
    await store.removeMessageNonce('m1');
    expect(await store.getMessageNonce('m1')).toBeNull();
  });

  it('throws nothing when removing an unknown pin', async () => {
    const store = new InMemoryNonceStore();
    await expect(store.removeMessageNonce('nope')).resolves.toBeUndefined();
  });

  it('keeps chains independent', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 9);
    await store.setNonce('stellar', 42);
    expect(await store.getNonce('stellar')).toBe(42);
    expect(await store.getNonce('ethereum')).toBe(9);
  });

  it('evicts the oldest pin beyond the configured cap', async () => {
    const store = new InMemoryNonceStore({ maxMessageNonces: 2 });
    await store.setMessageNonce('m1', 'ethereum', 0);
    await store.setMessageNonce('m2', 'ethereum', 1);
    await store.setMessageNonce('m3', 'ethereum', 2);

    expect(await store.getMessageNonce('m1')).toBeNull();
    expect(await store.getMessageNonce('m2')).toEqual({ chainId: 'ethereum', nonce: 1 });
    expect(await store.getMessageNonce('m3')).toEqual({ chainId: 'ethereum', nonce: 2 });
    expect(store.getStats()).toMatchObject({ messages: 2, evicted: 1 });
  });

  it('eviction does not remove pins already at the cap', async () => {
    const store = new InMemoryNonceStore({ maxMessageNonces: 100 });
    for (let i = 0; i < 100; i++) {
      await store.setMessageNonce(`m${i}`, 'ethereum', i);
    }
    expect((await store.getMessageNonce('m99'))!.nonce).toBe(99);
    expect(store.getStats().messages).toBe(100);
  });

  it('clear resets everything', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 1);
    await store.setMessageNonce('m', 'ethereum', 0);
    store.clear();
    expect(await store.getNonce('ethereum')).toBeNull();
    expect(await store.getMessageNonce('m')).toBeNull();
    expect(store.getStats().evicted).toBe(0);
  });

  it('exposes chain nonces and message pins for snapshotting', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 5);
    await store.setMessageNonce('m', 'ethereum', 4);
    expect(store.getChainNonces()).toEqual([['ethereum', 5]]);
    expect(store.getMessagePins()).toEqual([['m', { chainId: 'ethereum', nonce: 4 }]]);
  });
});