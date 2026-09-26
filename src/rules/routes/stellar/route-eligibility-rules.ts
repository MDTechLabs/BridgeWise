import {
  RouteRule,
  RouteContext,
  EligibilityResult,
  RuleCondition,
  RuleEvaluationLog,
} from './types';

export class StellarRouteEligibilityRulesFramework {
  private rules: RouteRule[] = [];

  addRule(rule: RouteRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(id: string): boolean {
    const before = this.rules.length;
    this.rules = this.rules.filter((r) => r.id !== id);
    return this.rules.length < before;
  }

  getRules(): RouteRule[] {
    return [...this.rules];
  }

  updateRule(id: string, patch: Partial<RouteRule>): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules[idx] = { ...this.rules[idx]!, ...patch };
    this.rules.sort((a, b) => b.priority - a.priority);
    return true;
  }

  evaluate(context: RouteContext): EligibilityResult {
    const enabledRules = this.rules.filter((r) => r.enabled);

    for (const rule of enabledRules) {
      if (this.matchesAll(rule.conditions, context)) {
        return {
          eligible: rule.action === 'allow',
          appliedRule: rule,
          reason: rule.action === 'allow'
            ? `Allowed by rule: ${rule.name}`
            : `Denied by rule: ${rule.name} — ${rule.description}`,
          evaluatedRules: enabledRules.indexOf(rule) + 1,
        };
      }
    }

    return {
      eligible: true,
      reason: 'No matching deny rule found; default allow.',
      evaluatedRules: enabledRules.length,
    };
  }

  evaluateWithLog(context: RouteContext): { result: EligibilityResult; log: RuleEvaluationLog[] } {
    const enabledRules = this.rules.filter((r) => r.enabled);
    const log: RuleEvaluationLog[] = [];
    let finalResult: EligibilityResult | null = null;

    for (const rule of enabledRules) {
      const matched = this.matchesAll(rule.conditions, context);
      log.push({ ruleId: rule.id, ruleName: rule.name, matched, action: rule.action });

      if (matched && !finalResult) {
        finalResult = {
          eligible: rule.action === 'allow',
          appliedRule: rule,
          reason: rule.action === 'allow'
            ? `Allowed by rule: ${rule.name}`
            : `Denied by rule: ${rule.name} — ${rule.description}`,
          evaluatedRules: log.length,
        };
      }
    }

    const result = finalResult ?? {
      eligible: true,
      reason: 'No matching rule; default allow.',
      evaluatedRules: log.length,
    };

    return { result, log };
  }

  private matchesAll(conditions: RuleCondition[], context: RouteContext): boolean {
    return conditions.every((cond) => this.matchesCondition(cond, context));
  }

  private matchesCondition(cond: RuleCondition, context: RouteContext): boolean {
    const ctxValue = this.resolveField(cond.field, context);
    if (ctxValue === undefined) return false;

    switch (cond.operator) {
      case 'equals':
        return ctxValue === cond.value;
      case 'not_equals':
        return ctxValue !== cond.value;
      case 'greater_than':
        return typeof ctxValue === 'number' && typeof cond.value === 'number' && ctxValue > cond.value;
      case 'less_than':
        return typeof ctxValue === 'number' && typeof cond.value === 'number' && ctxValue < cond.value;
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(ctxValue);
      case 'not_in':
        return Array.isArray(cond.value) && !cond.value.includes(ctxValue);
      default:
        return false;
    }
  }

  private resolveField(field: string, context: RouteContext): unknown {
    const parts = field.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
