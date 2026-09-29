import { NonceManager } from '../nonce-manager';
import { InMemoryNonceStore } from '../in-memory-nonce-store';
import { NonceStore } from '../../types';

function failingStore(overrides: Partial<NonceStore> = {}): NonceStore {
  const base = new InMemoryNonceStore();
  return {
    getNonce: (chainId) => base.getNonce(chainId),
    setNonce: (chainId, nonce) => Promise.reject(new Error('backend unavailable')),
    getMessageNonce: (messageId) => base.getMessageNonce(messageId),
    setMessageNonce: (messageId, chainId, nonce) => base.setMessageNonce(messageId, chainId, nonce),
    removeMessageNonce: (messageId) => base.removeMessageNonce(messageId),
    ...overrides,
  };
}

describe('NonceManager', () => {
  it('starts at zero with an empty store', async () => {
    const manager = new NonceManager('ethereum');
    expect(manager.getNonce()).toBe(0);
    expect(await manager.acquire('m1')).toBe(0);
    expect(manager.getNonce()).toBe(1);
  });

  it('adopts the persisted high-water mark on load', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 7);
    const manager = new NonceManager('ethereum', { store });
    expect(await manager.acquire('m1')).toBe(7);
    expect(manager.getNonce()).toBe(8);
  });

  it('persists the counter and the pin before assigning', async () => {
    const store = new InMemoryNonceStore();
    const manager = new NonceManager('ethereum', { store });
    const assigned = await manager.acquire('m1');
    expect(assigned).toBe(0);
    expect(await store.getNonce('ethereum')).toBe(1);
    expect(await store.getMessageNonce('m1')).toEqual({ chainId: 'ethereum', nonce: 0 });
  });

  it('reuses the pinned nonce for a redelivered message', async () => {
    const store = new InMemoryNonceStore();
    const manager = new NonceManager('ethereum', { store });
    const reused = jest.fn();
    manager.on('nonce-reused', reused);

    expect(await manager.acquire('m1')).toBe(0);
    expect(await manager.acquire('m2')).toBe(1);
    expect(await manager.acquire('m1')).toBe(0); // redelivery reuses

    expect(reused).toHaveBeenCalledWith({ chainId: 'ethereum', messageId: 'm1', nonce: 0 });
    expect(await store.getNonce('ethereum')).toBe(2); // high-water untouched by reuse
    expect((await store.getMessageNonce('m1'))!.nonce).toBe(0);
  });

  it('hands out distinct, strictly increasing nonces to concurrent messages', async () => {
    const manager = new NonceManager('ethereum');
    const [a, b, c] = await Promise.all([
      manager.acquire('ma'),
      manager.acquire('mb'),
      manager.acquire('mc'),
    ]);
    expect(new Set([a, b, c]).size).toBe(3);
    expect([a, b, c].sort((x, y) => x - y)).toEqual([0, 1, 2]);
    expect(manager.getNonce()).toBe(3);
  });

  it('keeps a chain-pinned pin that points at another chain unused', async () => {
    const store = new InMemoryNonceStore();
    await store.setMessageNonce('m1', 'stellar', 3);
    const manager = new NonceManager('ethereum', { store });
    expect(await manager.acquire('m1')).toBe(0); // pin belongs to another chain → fresh nonce
  });

  it('rolls the counter back and rethrows when persistence fails', async () => {
    const store = failingStore();
    const manager = new NonceManager('ethereum', { store });
    const errorSpy = jest.fn();
    manager.on('nonce-error', errorSpy);

    await expect(manager.acquire('m1')).rejects.toThrow('backend unavailable');
    expect(manager.getNonce()).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'ethereum', messageId: 'm1', phase: 'persist' }),
    );

    // A later, healthy acquire starts over at the rolled-back value.
    const healthy = new NonceManager('ethereum', { store: new InMemoryNonceStore() });
    expect(await healthy.acquire('m1')).toBe(0);
  });

  it('surfaces a load failure and retries on the next acquire', async () => {
    const base = new InMemoryNonceStore();
    const store: NonceStore = {
      getNonce: () => Promise.reject(new Error('backend unavailable')),
      setNonce: (chainId, nonce) => base.setNonce(chainId, nonce),
      getMessageNonce: (messageId) => base.getMessageNonce(messageId),
      setMessageNonce: (messageId, chainId, nonce) => base.setMessageNonce(messageId, chainId, nonce),
      removeMessageNonce: (messageId) => base.removeMessageNonce(messageId),
    };
    const manager = new NonceManager('ethereum', { store });
    const errorSpy = jest.fn();
    manager.on('nonce-error', errorSpy);
    await expect(manager.acquire('m1')).rejects.toThrow('backend unavailable');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'ethereum', phase: 'load' }),
    );
  });

  it('declines values that would move the counter backwards', async () => {
    const manager = new NonceManager('ethereum');
    manager.updateNonce(5);
    expect(manager.getNonce()).toBe(5);
    manager.updateNonce(3);
    expect(manager.getNonce()).toBe(5); // raising-only: never reuse
  });

  it('honours raiseOnly disabled for operators who need an exact value', async () => {
    const manager = new NonceManager('ethereum', { raiseOnly: false });
    manager.updateNonce(5);
    manager.updateNonce(3);
    expect(manager.getNonce()).toBe(3);
  });

  it('updates the counter before the next acquire', async () => {
    const manager = new NonceManager('ethereum');
    manager.updateNonce(9);
    expect(await manager.acquire('m1')).toBe(9);
    expect(manager.getNonce()).toBe(10);
  });

  it('releases a pin after a confirmed delivery', async () => {
    const store = new InMemoryNonceStore();
    const manager = new NonceManager('ethereum', { store });
    await manager.acquire('m1');
    await manager.release('m1');
    expect(await store.getMessageNonce('m1')).toBeNull();
    expect(await store.getNonce('ethereum')).toBe(1); // counter persists after release
  });

  it('reports a release failure without failing the caller', async () => {
    const base = new InMemoryNonceStore();
    const store: NonceStore = {
      getNonce: (chainId) => base.getNonce(chainId),
      setNonce: (chainId, nonce) => base.setNonce(chainId, nonce),
      getMessageNonce: (messageId) => base.getMessageNonce(messageId),
      setMessageNonce: (messageId, chainId, nonce) => base.setMessageNonce(messageId, chainId, nonce),
      removeMessageNonce: () => Promise.reject(new Error('cannot remove')),
    };
    const manager = new NonceManager('ethereum', { store });
    const errorSpy = jest.fn();
    manager.on('nonce-error', errorSpy);
    await expect(manager.release('m1')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', phase: 'release' }),
    );
  });

  it('emits nonce-loaded once for several acquisitions', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 2);
    const manager = new NonceManager('ethereum', { store });
    const loaded = jest.fn();
    manager.on('nonce-loaded', loaded);
    await manager.acquire('m1');
    await manager.acquire('m2');
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'ethereum', nonce: 2, source: 'store' }),
    );
  });

  it('explicit sync adopts the persisted value without assigning', async () => {
    const store = new InMemoryNonceStore();
    await store.setNonce('ethereum', 4);
    const manager = new NonceManager('ethereum', { store });
    await manager.sync();
    expect(manager.getNonce()).toBe(4);
    expect(await store.getMessageNonce('anything')).toBeNull();
  });
});