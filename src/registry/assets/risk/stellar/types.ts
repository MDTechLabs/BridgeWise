/**
 * Stellar Asset Risk Registry Types
 * Defines types for centrally storing and managing asset risk metadata.
 */

/**
 * Overall risk level for an asset.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Categories of risk an asset may be subject to.
 */
export type RiskCategory =
  | 'volatility'
  | 'liquidity'
  | 'counterparty'
  | 'regulatory'
  | 'technical'
  | 'market'
  | 'custodial';

/**
 * Detailed risk assessment for a specific category.
 */
export interface RiskAssessment {
  /** Risk category being assessed */
  category: RiskCategory;
  /** Risk level for this category */
  level: RiskLevel;
  /** Numeric score 0-100 (lower = safer) */
  score: number;
  /** Human-readable summary of the risk */
  summary: string;
  /** Detailed risk description */
  details?: string;
  /** Source of this assessment */
  source?: string;
  /** When this assessment was last updated */
  updatedAt: string;
}

/**
 * Complete risk entry for a single asset.
 */
export interface AssetRiskEntry {
  /** Asset symbol (uppercase) */
  symbol: string;
  /** Full asset name */
  name: string;
  /** Network/chain the asset is native to */
  chain: string;
  /** Contract address or issuer (where applicable) */
  address?: string;
  /** Overall aggregated risk level */
  overallRisk: RiskLevel;
  /** Overall risk score 0-100 (lower = safer) */
  overallScore: number;
  /** Individual risk assessments per category */
  assessments: RiskAssessment[];
  /** List of risk tags for quick filtering */
  tags: string[];
  /** When this entry was first registered */
  registeredAt: string;
  /** When this entry was last updated */
  updatedAt: string;
  /** Version increment counter for tracking changes */
  version: number;
}

/**
 * A single point in the risk history timeline.
 */
export interface RiskHistoryEntry {
  /** Unique history entry id */
  id: string;
  /** Asset symbol */
  symbol: string;
  /** The risk level at this point in time */
  riskLevel: RiskLevel;
  /** The risk score at this point in time */
  riskScore: number;
  /** Which assessments changed (if any) */
  changedCategories: RiskCategory[];
  /** Reason for the change */
  reason: string;
  /** When this change was recorded */
  timestamp: string;
  /** Version of the risk entry after this change */
  version: number;
}

/**
 * Input for registering or updating an asset's risk information.
 */
export interface RegisterRiskInput {
  symbol: string;
  name: string;
  chain: string;
  address?: string;
  assessments: Omit<RiskAssessment, 'updatedAt'>[];
  tags?: string[];
}

export interface UpdateRiskInput {
  name?: string;
  address?: string;
  assessments?: Omit<RiskAssessment, 'updatedAt'>[];
  tags?: string[];
  /** Reason for the update (recorded in history) */
  changeReason: string;
}

/**
 * Query filters for risk lookups.
 */
export interface RiskQuery {
  /** Filter by risk level */
  riskLevel?: RiskLevel;
  /** Filter by risk level or higher (inclusive) */
  minRiskLevel?: RiskLevel;
  /** Filter by chain */
  chain?: string;
  /** Filter by risk category */
  category?: RiskCategory;
  /** Filter by tag */
  tag?: string;
  /** Maximum risk score (inclusive) */
  maxScore?: number;
}

export interface RiskRegistryStats {
  totalAssets: number;
  byRiskLevel: Record<RiskLevel, number>;
  byChain: Record<string, number>;
  byCategory: Record<RiskCategory, number>;
  averageOverallScore: number;
  riskiestAssets: Array<{ symbol: string; score: number }>;
  safestAssets: Array<{ symbol: string; score: number }>;
  totalHistoryEntries: number;
}

/**
 * Risk level numeric ordering for comparisons.
 */
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
