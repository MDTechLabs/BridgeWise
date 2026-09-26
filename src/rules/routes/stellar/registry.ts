
import { SorobanRouteRule } from './types';

export class SorobanRouteRuleRegistry {
  private rules: SorobanRouteRule[] = [];

  register(rule: SorobanRouteRule) {
    this.rules.push(rule);
  }

  getAll(): SorobanRouteRule[] {
    return this.rules;
  }
}