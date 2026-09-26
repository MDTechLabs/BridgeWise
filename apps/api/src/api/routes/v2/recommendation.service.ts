import { Injectable, Logger } from '@nestjs/common';
import {
  AdvancedFiltersDto,
  BridgeRouteDto,
  RankedRouteV2Dto,
  RankingPreference,
  RecommendationRequestV2Dto,
} from './dto/recommendation.dto';

@Injectable()
export class RecommendationV2Service {
  private readonly logger = new Logger(RecommendationV2Service.name);

  recommend(request: RecommendationRequestV2Dto): RankedRouteV2Dto[] {
    const { routes, preference = RankingPreference.BALANCED, filters } = request;

    if (!routes || routes.length === 0) {
      return [];
    }

    // 1. Filter routes
    const filteredRoutes = this.applyFilters(routes, filters);

    if (filteredRoutes.length === 0) {
      return [];
    }

    // 2. Score routes
    const scoredRoutes = this.scoreRoutes(filteredRoutes, preference);

    // 3. Generate insights and rank
    const ranked = scoredRoutes
      .sort((a, b) => b.score - a.score)
      .map((item, index) => {
        const rank = index + 1;
        return {
          route: item.route,
          score: item.score,
          rank,
          insight: this.generateInsight(item.route, rank, preference, item.breakdown),
        };
      });

    return ranked;
  }

  private applyFilters(routes: BridgeRouteDto[], filters?: AdvancedFiltersDto): BridgeRouteDto[] {
    if (!filters) return routes;

    return routes.filter((route) => {
      // Excluded bridges (takes precedence)
      if (filters.excludedBridges?.includes(route.bridgeName)) {
        return false;
      }

      // Preferred bridges (acts as whitelist if specified)
      if (filters.preferredBridges && filters.preferredBridges.length > 0) {
        if (!filters.preferredBridges.includes(route.bridgeName)) {
          return false;
        }
      }

      // Min liquidity
      if (filters.minLiquidity !== undefined && route.liquidity !== undefined) {
        if (route.liquidity < filters.minLiquidity) return false;
      }

      // Max fee
      if (filters.maxFee !== undefined) {
        if (route.fee > filters.maxFee) return false;
      }

      // Max time
      if (filters.maxTime !== undefined) {
        if (route.estimatedTime > filters.maxTime) return false;
      }

      // Max slippage
      if (filters.maxSlippage !== undefined) {
        if (route.slippage > filters.maxSlippage) return false;
      }

      // Min security score
      if (filters.minSecurityScore !== undefined && route.securityScore !== undefined) {
        if (route.securityScore < filters.minSecurityScore) return false;
      }

      return true;
    });
  }

  private scoreRoutes(
    routes: BridgeRouteDto[],
    preference: RankingPreference,
  ): Array<{ route: BridgeRouteDto; score: number; breakdown: Record<string, number> }> {
    // Determine weights based on preference
    let feeWeight = 0;
    let timeWeight = 0;
    let securityWeight = 0;
    let reliabilityWeight = 0;

    switch (preference) {
      case RankingPreference.FEE:
        feeWeight = 0.6;
        timeWeight = 0.1;
        securityWeight = 0.1;
        reliabilityWeight = 0.2;
        break;
      case RankingPreference.TIME:
        feeWeight = 0.1;
        timeWeight = 0.6;
        securityWeight = 0.1;
        reliabilityWeight = 0.2;
        break;
      case RankingPreference.SECURITY:
        feeWeight = 0.1;
        timeWeight = 0.1;
        securityWeight = 0.6;
        reliabilityWeight = 0.2;
        break;
      case RankingPreference.RELIABILITY:
        feeWeight = 0.1;
        timeWeight = 0.1;
        securityWeight = 0.1;
        reliabilityWeight = 0.7;
        break;
      case RankingPreference.BALANCED:
      default:
        feeWeight = 0.3;
        timeWeight = 0.3;
        securityWeight = 0.2;
        reliabilityWeight = 0.2;
        break;
    }

    // Normalize values
    const maxFee = Math.max(...routes.map((r) => r.fee), 1);
    const maxTime = Math.max(...routes.map((r) => r.estimatedTime), 1);

    return routes.map((route) => {
      // Lower fee is better (0 to 1)
      const normalizedFee = 1 - route.fee / maxFee;
      // Lower time is better (0 to 1)
      const normalizedTime = 1 - route.estimatedTime / maxTime;
      // Security is usually 0 to 1
      const normalizedSecurity = route.securityScore ?? 0.5;
      // Reliability is usually 0 to 1
      const normalizedReliability = route.reliabilityScore ?? 0.5;

      const feeScore = normalizedFee * feeWeight * 100;
      const timeScore = normalizedTime * timeWeight * 100;
      const securityScore = normalizedSecurity * securityWeight * 100;
      const reliabilityScore = normalizedReliability * reliabilityWeight * 100;

      const totalScore = feeScore + timeScore + securityScore + reliabilityScore;

      return {
        route,
        score: Math.round(totalScore * 100) / 100,
        breakdown: {
          feeScore,
          timeScore,
          securityScore,
          reliabilityScore,
        },
      };
    });
  }

  private generateInsight(
    route: BridgeRouteDto,
    rank: number,
    preference: RankingPreference,
    breakdown: Record<string, number>,
  ) {
    let reason = '';
    
    if (rank === 1) {
      switch (preference) {
        case RankingPreference.FEE:
          reason = 'Recommended due to lowest overall fees.';
          break;
        case RankingPreference.TIME:
          reason = 'Recommended for the fastest estimated completion time.';
          break;
        case RankingPreference.SECURITY:
          reason = 'Recommended based on highest security score.';
          break;
        case RankingPreference.RELIABILITY:
          reason = 'Recommended due to high historical reliability.';
          break;
        case RankingPreference.BALANCED:
          reason = 'Best overall balance of speed, cost, and reliability.';
          break;
      }
    } else {
      // Identify strongest factor for lower ranked routes
      const maxFactor = Object.keys(breakdown).reduce((a, b) => (breakdown[a] > breakdown[b] ? a : b));
      if (maxFactor === 'feeScore') reason = 'Good alternative for low fees.';
      else if (maxFactor === 'timeScore') reason = 'Good alternative for fast speed.';
      else if (maxFactor === 'securityScore') reason = 'Good alternative with solid security.';
      else reason = 'Viable alternative route.';
    }

    return {
      reason,
      factors: breakdown,
    };
  }
}
