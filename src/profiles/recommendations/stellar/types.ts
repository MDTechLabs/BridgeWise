/**
 * Soroban Route Recommendation Profiles Types
 * Defines types for user-configurable route preference profiles
 * that influence bridge route ranking.
 */

/**
 * Predefined profile templates with sensible defaults.
 */
export type ProfileTemplateId =
  | 'cheapest'
  | 'fastest'
  | 'most-reliable'
  | 'balanced'
  | 'secure'
  | 'custom';

/**
 * Weight configuration that determines how routes are scored.
 * Each weight is 0-1 and they should sum to 1 for proper normalization.
 */
export interface ProfileWeights {
  /** Importance of low fees. Default: 0.25 */
  feeWeight: number;
  /** Importance of fast execution. Default: 0.25 */
  speedWeight: number;
  /** Importance of high success rate. Default: 0.25 */
  reliabilityWeight: number;
  /** Importance of route security. Default: 0.15 */
  securityWeight: number;
  /** Importance of provider reputation. Default: 0.10 */
  providerWeight: number;
}

/**
 * Constraint thresholds applied during route filtering.
 */
export interface ProfileConstraints {
  /** Maximum acceptable transfer time in minutes. 0 = no limit */
  maxTimeMinutes?: number;
  /** Maximum acceptable fee in basis points. 0 = no limit */
  maxFeeBps?: number;
  /** Minimum acceptable success rate (0-1) */
  minSuccessRate?: number;
  /** Maximum acceptable slippage percentage */
  maxSlippagePercent?: number;
  /** Excluded bridge protocols */
  excludedProtocols?: string[];
  /** Excluded providers */
  excludedProviders?: string[];
  /** Preferred providers (boosted in ranking) */
  preferredProviders?: string[];
}

export interface RecommendationProfile {
  /** Unique profile identifier */
  id: string;
  /** Human-readable profile name */
  name: string;
  /** Profile template this was based on, or 'custom' */
  templateId: ProfileTemplateId;
  /** User description / notes */
  description?: string;
  /** Ranking weights */
  weights: ProfileWeights;
  /** Filtering constraints */
  constraints: ProfileConstraints;
  /** Whether this is the default profile */
  isDefault: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Number of times this profile has been applied */
  usageCount: number;
}

/**
 * Input for creating or updating a profile.
 */
export interface CreateProfileInput {
  name: string;
  templateId?: ProfileTemplateId;
  description?: string;
  weights?: Partial<ProfileWeights>;
  constraints?: ProfileConstraints;
  isDefault?: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  weights?: Partial<ProfileWeights>;
  constraints?: ProfileConstraints;
  isDefault?: boolean;
}

/**
 * Result of applying a profile to a set of routes.
 */
export interface ProfileApplicationResult {
  profileId: string;
  profileName: string;
  /** Routes ranked according to the profile's weights */
  rankedRouteIds: string[];
  /** Scores for each route */
  routeScores: Record<string, number>;
  /** Number of routes that passed constraint filtering */
  eligibleCount: number;
  /** Number of routes filtered out by constraints */
  filteredCount: number;
  /** Which constraints were applied */
  appliedConstraints: ProfileConstraints;
  /** Timestamp of application */
  appliedAt: string;
}

export interface ProfileStats {
  totalProfiles: number;
  defaultProfileId: string | null;
  templateDistribution: Record<ProfileTemplateId, number>;
  mostUsedProfile: { id: string; name: string; usageCount: number } | null;
}
