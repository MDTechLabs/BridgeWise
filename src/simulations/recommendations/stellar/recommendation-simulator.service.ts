import { Injectable, Logger } from '@nestjs/common';

export interface RouteRanking {
  routeId: string;
  score: number;
  rank: number;
}

export interface SimulationReport {
  simulationId: string;
  originalRankings: RouteRanking[];
  simulatedRankings: RouteRanking[];
  differences: any[];
}

@Injectable()
export class SorobanRecommendationSimulatorService {
  private readonly logger = new Logger(SorobanRecommendationSimulatorService.name);

  simulateRankings(routes: string[], params: any): RouteRanking[] {
    this.logger.log('Simulating route rankings');
    return routes.map((routeId, index) => ({
      routeId,
      score: Math.random() * 100,
      rank: index + 1
    })).sort((a, b) => b.score - a.score);
  }

  compareOutcomes(original: RouteRanking[], simulated: RouteRanking[]): any[] {
    return original.map(o => {
      const sim = simulated.find(s => s.routeId === o.routeId);
      return {
        routeId: o.routeId,
        rankDifference: sim ? o.rank - sim.rank : 0
      };
    });
  }

  generateSimulationReport(simulationId: string, original: RouteRanking[], simulated: RouteRanking[]): SimulationReport {
    this.logger.log(`Generating simulation report for ${simulationId}`);
    return {
      simulationId,
      originalRankings: original,
      simulatedRankings: simulated,
      differences: this.compareOutcomes(original, simulated)
    };
  }
}
