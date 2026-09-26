import {
  ProfileTemplateId,
  ProfileWeights,
  ProfileConstraints,
  RecommendationProfile,
  CreateProfileInput,
  UpdateProfileInput,
  ProfileApplicationResult,
  ProfileStats,
  RouteQuery,
} from './types';

/**
 * Built-in profile templates with predefined weights and constraints.
 */
export const PROFILE_TEMPLATES: Record<Exclude<ProfileTemplateId, 'custom'>, {
  weights: ProfileWeights;
  constraints: ProfileConstraints;
  description: string;
}> = {
  cheapest: {
    weights: { feeWeight: 0.45, speedWeight: 0.10, reliabilityWeight: 0.20, securityWeight: 0.10, providerWeight: 0.15 },
    constraints: {},
    description: 'Prioritizes low fees above all else. Best for cost-sensitive transfers.',
  },
  fastest: {
    weights: { feeWeight: 0.10, speedWeight: 0.45, reliabilityWeight: 0.15, securityWeight: 0.15, providerWeight: 0.15 },
    constraints: { maxTimeMinutes: 30 },
    description: 'Prioritizes speed. Excludes routes exceeding 30 minutes.',
  },
  'most-reliable': {
    weights: { feeWeight: 0.15, speedWeight: 0.10, reliabilityWeight: 0.45, securityWeight: 0.15, providerWeight: 0.15 },
    constraints: { minSuccessRate: 0.95 },
    description: 'Prioritizes routes with proven high success rates.',
  },
  balanced: {
    weights: { feeWeight: 0.25, speedWeight: 0.25, reliabilityWeight: 0.25, securityWeight: 0.15, providerWeight: 0.10 },
    constraints: {},
    description: 'Balances fee, speed, reliability, security, and provider reputation equally.',
  },
  secure: {
    weights: { feeWeight: 0.10, speedWeight: 0.10, reliabilityWeight: 0.25, securityWeight: 0.40, providerWeight: 0.15 },
    constraints: { minSuccessRate: 0.90 },
    description: 'Prioritizes security and reliability. Best for high-value transfers.',
  },
};

/**
 * Manages user-configurable route recommendation profiles.
 *
 * Profiles define how routes are scored and filtered during bridge selection.
 * Predefined templates (cheapest, fastest, etc.) provide sensible defaults,
 * while custom profiles allow full control over weights and constraints.
 *
 * Usage:
 *   const profiles = new SorobanRouteRecommendationProfiles();
 *   const profile = profiles.createProfile({ name: 'My Profile', templateId: 'cheapest' });
 *   const result = profiles.applyProfile(profile.id, routes);
 */
export class SorobanRouteRecommendationProfiles {
  private readonly profiles: Map<string, RecommendationProfile> = new Map();
  private profileIdCounter = 0;
  private defaultProfileId: string | null = null;

  // ─── Profile Management ────────────────────────────────────────────────

  /**
   * Create a new recommendation profile.
   * If no templateId is provided, 'balanced' is used as the default.
   */
  createProfile(input: CreateProfileInput): RecommendationProfile {
    const templateId = input.templateId ?? 'balanced';
    const template = templateId !== 'custom'
      ? PROFILE_TEMPLATES[templateId]
      : null;

    const defaultWeights = template?.weights ?? PROFILE_TEMPLATES.balanced.weights;
    const defaultConstraints = template?.constraints ?? {};

    const now = new Date().toISOString();
    const id = `profile-${++this.profileIdCounter}`;

    const profile: RecommendationProfile = {
      id,
      name: input.name,
      templateId,
      description: input.description ?? template?.description,
      weights: { ...defaultWeights, ...input.weights },
      constraints: { ...defaultConstraints, ...input.constraints },
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    };

    // Ensure weights sum to (approximately) 1 by normalizing
    this.normalizeWeights(profile.weights);

    this.profiles.set(id, profile);

    if (profile.isDefault) {
      this.setDefaultProfile(id);
    }

    return profile;
  }

  /**
   * Update an existing profile.
   */
  updateProfile(profileId: string, input: UpdateProfileInput): RecommendationProfile {
    const profile = this.getOrThrow(profileId);
    const now = new Date().toISOString();

    if (input.weights) {
      profile.weights = { ...profile.weights, ...input.weights };
      this.normalizeWeights(profile.weights);
    }

    if (input.constraints) {
      profile.constraints = { ...profile.constraints, ...input.constraints };
    }

    if (input.name !== undefined) profile.name = input.name;
    if (input.description !== undefined) profile.description = input.description;
    profile.updatedAt = now;

    if (input.isDefault !== undefined) {
      profile.isDefault = input.isDefault;
      if (input.isDefault) {
        this.setDefaultProfile(profileId);
      } else if (this.defaultProfileId === profileId) {
        this.defaultProfileId = null;
      }
    }

    return profile;
  }

  /**
   * Delete a profile. If it was the default, another profile is not auto-selected.
   */
  deleteProfile(profileId: string): boolean {
    if (this.defaultProfileId === profileId) {
      this.defaultProfileId = null;
    }
    return this.profiles.delete(profileId);
  }

  /**
   * Set a profile as the default. Previous default is unset.
   */
  setDefaultProfile(profileId: string): void {
    if (!this.profiles.has(profileId)) {
      throw new Error(`Profile "${profileId}" not found`);
    }

    // Unset previous default
    if (this.defaultProfileId) {
      const prev = this.profiles.get(this.defaultProfileId);
      if (prev) prev.isDefault = false;
    }

    this.defaultProfileId = profileId;
    const profile = this.profiles.get(profileId)!;
    profile.isDefault = true;
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /**
   * Get a profile by id.
   */
  getProfile(profileId: string): RecommendationProfile | undefined {
    return this.profiles.get(profileId);
  }

  /**
   * Get all profiles.
   */
  getAllProfiles(): RecommendationProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get the current default profile, if any.
   */
  getDefaultProfile(): RecommendationProfile | null {
    if (!this.defaultProfileId) return null;
    return this.profiles.get(this.defaultProfileId) ?? null;
  }

  /**
   * Get profiles by template type.
   */
  getByTemplate(templateId: ProfileTemplateId): RecommendationProfile[] {
    return this.getAllProfiles().filter((p) => p.templateId === templateId);
  }

  // ─── Profile Application ───────────────────────────────────────────────

  /**
   * Apply a profile to a set of routes, returning ranked results.
   *
   * Routes are first filtered by the profile's constraints, then scored
   * using the profile's weights. Available route metrics are used for
   * scoring where present; missing metrics receive a neutral score.
   */
  applyProfile(
    profileId: string,
    routes: RouteQuery[],
  ): ProfileApplicationResult {
    const profile = this.getOrThrow(profileId);
    const now = new Date().toISOString();

    // Step 1: Filter by constraints
    const { eligible, filtered } = this.filterByConstraints(routes, profile.constraints);

    // Step 2: Score eligible routes
    const routeScores: Record<string, number> = {};
    const routeWeights = profile.weights;

    for (const route of eligible) {
      const feeScore = this.normalizeMetric(route.feeBps, 0, 100, true);
      const speedScore = this.normalizeMetric(route.estimatedTimeMinutes, 1, 120, true);
      const reliabilityScore = this.normalizeMetric(route.successRate, 0, 1, false);
      const securityScore = this.normalizeMetric(route.securityRating, 0, 1, false);
      const providerScore = this.normalizeMetric(route.providerRating, 0, 1, false);

      routeScores[route.id] =
        feeScore * routeWeights.feeWeight +
        speedScore * routeWeights.speedWeight +
        reliabilityScore * routeWeights.reliabilityWeight +
        securityScore * routeWeights.securityWeight +
        providerScore * routeWeights.providerWeight;
    }

    // Step 3: Rank by score (descending)
    const rankedRouteIds = Object.entries(routeScores)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);

    // Bump usage counter
    profile.usageCount++;

    return {
      profileId: profile.id,
      profileName: profile.name,
      rankedRouteIds,
      routeScores,
      eligibleCount: eligible.length,
      filteredCount: filtered.length,
      appliedConstraints: profile.constraints,
      appliedAt: now,
    };
  }

  // ─── Introspection ─────────────────────────────────────────────────────

  /**
   * Get stats about all profiles.
   */
  stats(): ProfileStats {
    const allProfiles = this.getAllProfiles();
    const templateDistribution: ProfileStats['templateDistribution'] = {
      cheapest: 0,
      fastest: 0,
      'most-reliable': 0,
      balanced: 0,
      secure: 0,
      custom: 0,
    };

    for (const p of allProfiles) {
      templateDistribution[p.templateId]++;
    }

    let mostUsed: ProfileStats['mostUsedProfile'] = null;
    for (const p of allProfiles) {
      if (!mostUsed || p.usageCount > mostUsed.usageCount) {
        mostUsed = { id: p.id, name: p.name, usageCount: p.usageCount };
      }
    }

    return {
      totalProfiles: allProfiles.length,
      defaultProfileId: this.defaultProfileId,
      templateDistribution,
      mostUsedProfile: mostUsed,
    };
  }

  /** Number of profiles. */
  get size(): number {
    return this.profiles.size;
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private getOrThrow(profileId: string): RecommendationProfile {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile "${profileId}" not found`);
    }
    return profile;
  }

  /**
   * Normalize weights so they sum to 1.
   * NOTE: mutates the passed-in `weights` object in place.
   */
  private normalizeWeights(weights: ProfileWeights): void {
    const sum = weights.feeWeight + weights.speedWeight + weights.reliabilityWeight +
      weights.securityWeight + weights.providerWeight;

    if (sum > 0 && Math.abs(sum - 1) > 0.001) {
      weights.feeWeight = weights.feeWeight / sum;
      weights.speedWeight = weights.speedWeight / sum;
      weights.reliabilityWeight = weights.reliabilityWeight / sum;
      weights.securityWeight = weights.securityWeight / sum;
      weights.providerWeight = weights.providerWeight / sum;
    }
  }

  private filterByConstraints(
    routes: RouteQuery[],
    constraints: ProfileConstraints,
  ): { eligible: RouteQuery[]; filtered: RouteQuery[] } {
    const eligible: RouteQuery[] = [];
    const filtered: RouteQuery[] = [];

    for (const route of routes) {
      let pass = true;

      if (constraints.maxTimeMinutes && route.estimatedTimeMinutes && route.estimatedTimeMinutes > constraints.maxTimeMinutes) {
        pass = false;
      }
      if (constraints.maxFeeBps && route.feeBps && route.feeBps > constraints.maxFeeBps) {
        pass = false;
      }
      if (constraints.minSuccessRate && route.successRate && route.successRate < constraints.minSuccessRate) {
        pass = false;
      }
      if (constraints.maxSlippagePercent && route.slippagePercent && route.slippagePercent > constraints.maxSlippagePercent) {
        pass = false;
      }
      if (constraints.excludedProtocols && route.bridgeProtocol && constraints.excludedProtocols.includes(route.bridgeProtocol)) {
        pass = false;
      }
      if (constraints.excludedProviders && route.provider && constraints.excludedProviders.includes(route.provider)) {
        pass = false;
      }

      if (pass) {
        eligible.push(route);
      } else {
        filtered.push(route);
      }
    }

    return { eligible, filtered };
  }

  private normalizeMetric(
    value: number | undefined,
    min: number,
    max: number,
    lowerIsBetter: boolean,
  ): number {
    if (value === undefined) return 0.5;
    if (max === min) return 0.5;

    const clamped = Math.max(min, Math.min(max, value));
    const normalized = (clamped - min) / (max - min);

    return lowerIsBetter ? 1 - normalized : normalized;
  }
}

// ─── Route shape used by applyProfile ─────────────────────────────────────────

export interface RouteQuery {
  id: string;
  bridgeProtocol?: string;
  provider?: string;
  feeBps?: number;
  estimatedTimeMinutes?: number;
  successRate?: number;
  securityRating?: number;
  providerRating?: number;
  slippagePercent?: number;
}
