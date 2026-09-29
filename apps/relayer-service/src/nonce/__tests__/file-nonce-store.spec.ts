import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileNonceStore, isMissingFileError } from '../file-nonce-store';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bridgewise-nonce-'));
}

describe('FileNonceStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = tempDir();
    file = join(dir, 'state', 'nonces.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty when the file does not exist yet', async () => {
    const store = new FileNonceStore({ filePath: file });
    expect(await store.getNonce('ethereum')).toBeNull();
    expect(store.getStats()).toEqual({ chains: 0, messages: 0, evicted: 0 });
  });

  it('round-trips nonces and creates the parent directory', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 7);
    await store.setNonce('stellar', 2);
    expect(await store.getNonce('ethereum')).toBe(7);
    expect(await store.getNonce('stellar')).toBe(2);
    expect(await store.getNonce('solana')).toBeNull();
    expect(existsSync(file)).toBe(true);
  });

  it('writes atomically and leaves no temporary files behind', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 1);
    await store.setMessageNonce('m1', 'ethereum', 0);
    expect(existsSync(`${file}.${process.pid}.tmp`)).toBe(false);
    expect(readFileSync(file, 'utf8')).toContain('"version":1');
  });

  it('restores state into a brand-new instance from the same file', async () => {
    await new FileNonceStore({ filePath: file }).setNonce('ethereum', 9);
    const fresh = new FileNonceStore({ filePath: file });
    expect(await fresh.getNonce('ethereum')).toBe(9);
  });

  it('round-trips and reloads message nonce pins', async () => {
    const writer = new FileNonceStore({ filePath: file });
    await writer.setMessageNonce('m1', 'ethereum', 4);
    await writer.setMessageNonce('m2', 'stellar', 0);

    const reader = new FileNonceStore({ filePath: file });
    expect(await reader.getMessageNonce('m1')).toEqual({ chainId: 'ethereum', nonce: 4 });
    expect(await reader.getMessageNonce('m2')).toEqual({ chainId: 'stellar', nonce: 0 });
    expect(await reader.getMessageNonce('nope')).toBeNull();

    await reader.removeMessageNonce('m1');
    expect(await reader.getMessageNonce('m1')).toBeNull();
  });

  it('fails fast on a corrupt file instead of resetting to zero', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 3);
    // Corrupt the payload out-of-band, as a torn write or manual edit would.
    writeFileSync(file, '{ this is not json', 'utf8');

    const reader = new FileNonceStore({ filePath: file });
    await expect(reader.getNonce('ethereum')).rejects.toThrow(/Cannot load nonce state/);
    // Keeps failing fast until an operator restores the file.
    await expect(reader.getNonce('ethereum')).rejects.toThrow(/refusing to reset nonces to zero/);
  });

  it('rejects an unsupported store version', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 3);
    writeFileSync(file, JSON.stringify({ version: 99, nonces: {} }), 'utf8');

    await expect(new FileNonceStore({ filePath: file }).getNonce('ethereum')).rejects.toThrow(
      /Unsupported nonce file version 99/,
    );
  });

  it('ignores malformed entries while loading a well-formed file', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 3);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        nonces: { ethereum: 3, broken: -5, bad: 'x' },
        messageNonces: { m: { chainId: 'ethereum', nonce: 0 }, n: { chainId: 12, nonce: 1 } },
      }),
      'utf8',
    );

    const reader = new FileNonceStore({ filePath: file });
    expect(await reader.getNonce('ethereum')).toBe(3);
    expect(await reader.getNonce('broken')).toBeNull();
    expect(await reader.getNonce('bad')).toBeNull();
    expect(await reader.getMessageNonce('m')).toEqual({ chainId: 'ethereum', nonce: 0 });
    expect(await reader.getMessageNonce('n')).toBeNull();
  });

  it('recovers after an operator restores a good file and calls reload()', async () => {
    const store = new FileNonceStore({ filePath: file });
    await store.setNonce('ethereum', 3);

    writeFileSync(file, '{ nope', 'utf8');
    store.reload();
    await expect(store.getNonce('ethereum')).rejects.toThrow(/Cannot load/);

    writeFileSync(
      file,
      JSON.stringify({ version: 1, nonces: { ethereum: 5 }, messageNonces: {} }),
      'utf8',
    );
    store.reload();
    expect(await store.getNonce('ethereum')).toBe(5);
  });

  it('works with fsync disabled', async () => {
    const store = new FileNonceStore({ filePath: file, fsync: false });
    await store.setNonce('ethereum', 11);
    expect(await new FileNonceStore({ filePath: file, fsync: false }).getNonce('ethereum')).toBe(11);
  });

  it('applies the message-pin cap across instances', async () => {
    const store = new FileNonceStore({ filePath: file, maxMessageNonces: 2 });
    await store.setMessageNonce('m1', 'ethereum', 0);
    await store.setMessageNonce('m2', 'ethereum', 1);
    await store.setMessageNonce('m3', 'ethereum', 2);
    expect(store.getStats().evicted).toBe(1);

    const reader = new FileNonceStore({ filePath: file, maxMessageNonces: 2 });
    expect(await reader.getMessageNonce('m1')).toBeNull();
    expect(await reader.getMessageNonce('m3')).toEqual({ chainId: 'ethereum', nonce: 2 });
  });

  it('serialises concurrent writes', async () => {
    const store = new FileNonceStore({ filePath: file });
    await Promise.all([
      store.setNonce('ethereum', 1),
      store.setNonce('stellar', 2),
      store.setMessageNonce('m', 'ethereum', 0),
    ]);
    const fresh = new FileNonceStore({ filePath: file });
    expect(await fresh.getNonce('ethereum')).toBe(1);
    expect(await fresh.getNonce('stellar')).toBe(2);
    expect(await fresh.getMessageNonce('m')).toEqual({ chainId: 'ethereum', nonce: 0 });
  });

  it('isMissingFileError recognises ENOENT-driven failures', () => {
    expect(isMissingFileError(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissingFileError(new Error('gone'))).toBe(false);
    expect(isMissingFileError('gone')).toBe(false);
  });

  if (process.platform !== 'win32') {
    it('creates the state file with owner-only permissions', async () => {
      const store = new FileNonceStore({ filePath: file });
      await store.setNonce('ethereum', 1);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    });
  }
});