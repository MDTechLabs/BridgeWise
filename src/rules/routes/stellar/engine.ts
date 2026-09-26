
import { SorobanRouteRule, SorobanRouteEligibility } from './types';

export class SorobanRouteEligibilityEngine {
  constructor(private rules: SorobanRouteRule[]) {}

  async check(route: any): Promise<SorobanRouteEligibility> {
    const unsatisfiedRules: string[] = [];

    for (const rule of this.rules) {
      if (!(await rule.isEligible(route))) {
        unsatisfiedRules.push(rule.name);
      }
    }

    return {
      isEligible: unsatisfiedRules.length === 0,
      unsatisfiedRules,
    };
  }
}