import {
  SorobanRouteRecommendationProfiles,
  RouteQuery,
} from './soroban-route-recommendation-profiles';

const makeRoute = (overrides: Partial<RouteQuery> = {}): RouteQuery => ({
  id: 'route-1',
  bridgeProtocol: 'Allbridge',
  provider: 'provider-a',
  feeBps: 50,
  estimatedTimeMinutes: 15,
  successRate: 0.98,
  securityRating: 0.85,
  providerRating: 0.90,
  slippagePercent: 0.5,
  ...overrides,
});

describe('SorobanRouteRecommendationProfiles', () => {
  let profiles: SorobanRouteRecommendationProfiles;

  beforeEach(() => {
    profiles = new SorobanRouteRecommendationProfiles();
  });

  // ─── Profile Creation ──────────────────────────────────────────────────

  it('creates a profile with default balanced template', () => {
    const profile = profiles.createProfile({ name: 'Test Profile' });

    expect(profile.name).toBe('Test Profile');
    expect(profile.templateId).toBe('balanced');
    expect(profile.weights.feeWeight).toBe(0.25);
    expect(profile.weights.speedWeight).toBe(0.25);
    expect(profile.usageCount).toBe(0);
    expect(profiles.size).toBe(1);
  });

  it('creates a profile from a specific template', () => {
    const profile = profiles.createProfile({
      name: 'Cheap Routes',
      templateId: 'cheapest',
    });

    expect(profile.templateId).toBe('cheapest');
    expect(profile.weights.feeWeight).toBeGreaterThan(profile.weights.speedWeight);
    expect(profile.description).toBeDefined();
  });

  it('creates a custom profile with overridden weights', () => {
    const profile = profiles.createProfile({
      name: 'Custom',
      templateId: 'custom',
      weights: { feeWeight: 0.6, speedWeight: 0.4 },
    });

    expect(profile.templateId).toBe('custom');
    // Weights should be normalized: 0.6+0.4 = 1.0 => normalized to 0.6, 0.4
    // but default weights also contribute. After merge: fee=0.6, speed=0.4, rest=defaults
    // sum = 0.6+0.4+0.25+0.15+0.10 = 1.5 → normalized: fee=0.4, speed=0.267...
    expect(profile.weights.feeWeight).toBeCloseTo(0.4, 1);
    expect(profile.weights.speedWeight).toBeCloseTo(0.267, 1);
  });

  it('sets the first profile as default when isDefault is true', () => {
    const profile = profiles.createProfile({ name: 'Default', isDefault: true });
    expect(profile.isDefault).toBe(true);
    expect(profiles.getDefaultProfile()?.id).toBe(profile.id);
  });

  // ─── Profile Management ────────────────────────────────────────────────

  it('updates a profile', () => {
    const profile = profiles.createProfile({ name: 'Test' });
    const updated = profiles.updateProfile(profile.id, {
      name: 'Updated Name',
      weights: { feeWeight: 0.5 },
    });

    expect(updated.name).toBe('Updated Name');
  });

  it('throws when updating non-existent profile', () => {
    expect(() =>
      profiles.updateProfile('nonexistent', { name: 'test' }),
    ).toThrow('not found');
  });

  it('deletes a profile', () => {
    const profile = profiles.createProfile({ name: 'Test' });
    expect(profiles.deleteProfile(profile.id)).toBe(true);
    expect(profiles.size).toBe(0);
  });

  it('clears default when default profile is deleted', () => {
    const profile = profiles.createProfile({ name: 'Default', isDefault: true });
    profiles.deleteProfile(profile.id);
    expect(profiles.getDefaultProfile()).toBeNull();
  });

  // ─── Default Profile ───────────────────────────────────────────────────

  it('sets an existing profile as default', () => {
    const p1 = profiles.createProfile({ name: 'First' });
    const p2 = profiles.createProfile({ name: 'Second' });

    profiles.setDefaultProfile(p2.id);
    expect(profiles.getDefaultProfile()?.id).toBe(p2.id);
    expect(p2.isDefault).toBe(true);

    // Previous default should be unset (but p1 was never default)
    profiles.setDefaultProfile(p1.id);
    expect(profiles.getDefaultProfile()?.id).toBe(p1.id);
  });

  it('throws when setting unknown profile as default', () => {
    expect(() => profiles.setDefaultProfile('nonexistent')).toThrow('not found');
  });

  // ─── Profile Lookup ────────────────────────────────────────────────────

  it('gets profiles by template', () => {
    profiles.createProfile({ name: 'Fast', templateId: 'fastest' });
    profiles.createProfile({ name: 'Fast 2', templateId: 'fastest' });
    profiles.createProfile({ name: 'Cheap', templateId: 'cheapest' });

    const fastProfiles = profiles.getByTemplate('fastest');
    expect(fastProfiles).toHaveLength(2);
  });

  // ─── Profile Application ───────────────────────────────────────────────

  it('applies a profile to rank routes', () => {
    const profile = profiles.createProfile({
      name: 'Test',
      templateId: 'balanced',
    });

    const routes: RouteQuery[] = [
      makeRoute({ id: 'cheap', feeBps: 10, estimatedTimeMinutes: 60 }),
      makeRoute({ id: 'fast', feeBps: 80, estimatedTimeMinutes: 5 }),
      makeRoute({ id: 'reliable', feeBps: 30, estimatedTimeMinutes: 20, successRate: 0.99 }),
    ];

    const result = profiles.applyProfile(profile.id, routes);

    expect(result.eligibleCount).toBe(3);
    expect(result.filteredCount).toBe(0);
    expect(result.rankedRouteIds).toHaveLength(3);
    expect(result.routeScores).toBeDefined();
  });

  it('filters routes by constraints', () => {
    const profile = profiles.createProfile({
      name: 'Strict',
      templateId: 'fastest',
      constraints: {
        maxTimeMinutes: 30,
        maxFeeBps: 50,
        excludedProviders: ['bad-provider'],
      },
    });

    const routes: RouteQuery[] = [
      makeRoute({ id: 'good', feeBps: 20, estimatedTimeMinutes: 10, provider: 'good-provider' }),
      makeRoute({ id: 'too-slow', feeBps: 20, estimatedTimeMinutes: 45, provider: 'good-provider' }),
      makeRoute({ id: 'too-expensive', feeBps: 80, estimatedTimeMinutes: 10, provider: 'good-provider' }),
      makeRoute({ id: 'bad-provider', feeBps: 20, estimatedTimeMinutes: 10, provider: 'bad-provider' }),
    ];

    const result = profiles.applyProfile(profile.id, routes);

    expect(result.eligibleCount).toBe(1);
    expect(result.filteredCount).toBe(3);
    expect(result.rankedRouteIds).toEqual(['good']);
  });

  it('increments usage count on profile application', () => {
    const profile = profiles.createProfile({ name: 'Test' });

    profiles.applyProfile(profile.id, [makeRoute()]);
    profiles.applyProfile(profile.id, [makeRoute()]);

    const fetched = profiles.getProfile(profile.id);
    expect(fetched?.usageCount).toBe(2);
  });

  it('throws when applying non-existent profile', () => {
    expect(() =>
      profiles.applyProfile('nonexistent', [makeRoute()]),
    ).toThrow('not found');
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  it('reports stats correctly', () => {
    const p1 = profiles.createProfile({ name: 'Fast', templateId: 'fastest' });
    const p2 = profiles.createProfile({ name: 'Cheap', templateId: 'cheapest' });

    // Use profiles to bump counts
    profiles.applyProfile(p1.id, [makeRoute()]);
    profiles.applyProfile(p1.id, [makeRoute()]);
    profiles.applyProfile(p1.id, [makeRoute()]);
    profiles.applyProfile(p2.id, [makeRoute()]);

    const stats = profiles.stats();

    expect(stats.totalProfiles).toBe(2);
    expect(stats.templateDistribution.fastest).toBe(1);
    expect(stats.templateDistribution.cheapest).toBe(1);
    expect(stats.mostUsedProfile?.id).toBe(p1.id);
    expect(stats.mostUsedProfile?.usageCount).toBe(3);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it('empty stats for no profiles', () => {
    const stats = profiles.stats();
    expect(stats.totalProfiles).toBe(0);
    expect(stats.defaultProfileId).toBeNull();
    expect(stats.mostUsedProfile).toBeNull();
  });

  it('handles routes with missing metrics', () => {
    const profile = profiles.createProfile({ name: 'Test' });
    const route = makeRoute({
      feeBps: undefined,
      successRate: undefined,
    });

    const result = profiles.applyProfile(profile.id, [route]);
    expect(result.eligibleCount).toBe(1);
    expect(result.routeScores[route.id]).toBeDefined();
  });
});
