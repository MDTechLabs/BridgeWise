
export interface SorobanRouteRule {
  name: string;
  description: string;
  isEligible(route: any): Promise<boolean>;
}

export interface SorobanRouteEligibility {
  isEligible: boolean;
  unsatisfiedRules: string[];
}