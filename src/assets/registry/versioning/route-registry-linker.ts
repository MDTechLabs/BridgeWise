import { RegistryVersionStore } from './registry-version-store';
import { RouteDecision, RouteRegistryLink } from './types';

/**
 * Associates routing decisions with the registry version they were computed
 * against. This makes it possible to re-run a decision against the same
 * registry state, or to detect when a decision has gone stale because the
 * registry has since changed.
 *
 * Usage:
 *   const linker = new RouteRegistryLinker(store);
 *   linker.linkRouteDecision({ routeId: 'route-1' });
 *   linker.isRouteStale('route-1');
 */
export class RouteRegistryLinker {
  private readonly links = new Map<string, RouteRegistryLink>();

  constructor(private readonly store: RegistryVersionStore) {}

  // ─── Linking ───────────────────────────────────────────────────────────

  /**
   * Associate a route decision with a registry version.
   *
   * @param decision The route decision record (only `routeId` is required).
   * @param version Target registry version. Defaults to the latest version.
   * @throws Error when no version is available or the version does not exist.
   */
  linkRouteDecision(
    decision: RouteDecision,
    version?: number,
  ): RouteRegistryLink {
    if (!decision?.routeId?.trim()) {
      throw new Error('routeId must be a non-empty string');
    }

    const target =
      version === undefined
        ? this.store.getLatestVersion()
        : this.store.getVersion(version);

    if (!target) {
      throw new Error(
        version === undefined
          ? 'Cannot link a route decision: no registry versions exist yet'
          : `Cannot link a route decision: registry version ${version} does not exist`,
      );
    }

    const link: RouteRegistryLink = {
      routeId: decision.routeId,
      registryVersion: target.version,
      registryVersionId: target.id,
      linkedAt: new Date().toISOString(),
    };

    this.links.set(decision.routeId, link);
    return { ...link };
  }

  /** Remove the association for a route decision. Returns true if removed. */
  unlinkRoute(routeId: string): boolean {
    return this.links.delete(routeId);
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /** Get the registry link for a route decision. */
  getLink(routeId: string): RouteRegistryLink | undefined {
    const link = this.links.get(routeId);
    return link ? { ...link } : undefined;
  }

  /** Get the registry version number a route decision was based on. */
  getRegistryVersionForRoute(routeId: string): number | undefined {
    return this.links.get(routeId)?.registryVersion;
  }

  /** Get every route decision linked to a given registry version. */
  getRoutesForVersion(version: number): RouteRegistryLink[] {
    return Array.from(this.links.values())
      .filter((link) => link.registryVersion === version)
      .map((link) => ({ ...link }));
  }

  /** List all route-registry associations. */
  listLinks(): RouteRegistryLink[] {
    return Array.from(this.links.values()).map((link) => ({ ...link }));
  }

  // ─── Staleness ─────────────────────────────────────────────────────────

  /**
   * Whether a route decision was computed against an older registry version
   * than the current latest one.
   */
  isRouteStale(routeId: string): boolean {
    const link = this.links.get(routeId);
    if (!link) return false;
    return link.registryVersion < this.store.getLatestVersionNumber();
  }

  /** Number of tracked associations. */
  get size(): number {
    return this.links.size;
  }
}
