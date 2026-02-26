import { isServer } from './env';

/**
 * Error thrown when a browser-only API is accessed on the server.
 */
export class ServerAccessError extends Error {
  constructor(api: string) {
    super(
      `[BridgeWise] "${api}" is not available during server-side rendering. ` +
        `Wrap the call in a useEffect or use the <ClientOnly> component.`,
    );
    this.name = 'ServerAccessError';
  }
}

/**
 * Creates a proxy that throws `ServerAccessError` when any property is
 * accessed on the server, and delegates to `factory()` on the client.
 *
 * @example
 * ```ts
 * const ethereum = createBrowserGuard('window.ethereum', () => window.ethereum);
 * ```
 */
export function createBrowserGuard<T extends object>(
  name: string,
  factory: () => T,
): T {
  if (!isServer) {
    return factory();
  }

  return new Proxy({} as T, {
    get(_target, prop) {
      // Allow Symbol.toPrimitive / toJSON etc. to avoid noisy errors in SSR
      // serialisation paths.
      if (typeof prop === 'symbol') return undefined;
      throw new ServerAccessError(`${name}.${String(prop)}`);
    },
  });
}
