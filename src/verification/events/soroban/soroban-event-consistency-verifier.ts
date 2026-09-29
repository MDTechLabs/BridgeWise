/**
 * Soroban event emission consistency.
 *
 * Downstream indexers, webhooks and settlement matchers all read the events a
 * contract emits. When an expected event is missing, a payload field is
 * dropped, or the order changes, those consumers fail quietly. This verifier
 * compares the events actually emitted by a transaction against the declared
 * schema and reports every deviation.
 */

export interface SorobanEventSpec {
  name: string;
  topic: string;
  requiredFields: string[];
  /** Position this event should occupy within the transaction. */
  order: number;
  /** Maximum occurrences allowed. Default 1. */
  maxOccurrences?: number;
  required?: boolean;
}

export interface ObservedSorobanEvent {
  name: string;
  topic: string;
  payload: Record<string, unknown>;
  ledger?: number;
  txHash?: string;
}

export type EventConsistencyIssueCode =
  | 'MISSING_REQUIRED_EVENT'
  | 'DUPLICATE_EVENT'
  | 'UNEXPECTED_EVENT'
  | 'MISSING_REQUIRED_FIELD'
  | 'TOPIC_MISMATCH'
  | 'EVENT_OUT_OF_ORDER';

export type EventConsistencySeverity = 'error' | 'warning';

export interface EventConsistencyIssue {
  code: EventConsistencyIssueCode;
  severity: EventConsistencySeverity;
  message: string;
  eventName?: string;
}

export interface EventConsistencyReport {
  consistent: boolean;
  issues: EventConsistencyIssue[];
}

export class SorobanEventConsistencyVerifier {
  private readonly specsByName: Map<string, SorobanEventSpec>;

  constructor(private readonly specs: SorobanEventSpec[] = []) {
    this.specsByName = new Map(specs.map((spec) => [spec.name, spec]));
  }

  verify(events: ObservedSorobanEvent[]): EventConsistencyReport {
    const issues: EventConsistencyIssue[] = [];
    const counts = new Map<string, number>();

    for (const event of events) {
      counts.set(event.name, (counts.get(event.name) ?? 0) + 1);

      const spec = this.specsByName.get(event.name);

      if (!spec) {
        issues.push({
          code: 'UNEXPECTED_EVENT',
          severity: 'warning',
          message: `Emitted event ${event.name} is not declared in the schema`,
          eventName: event.name,
        });
        continue;
      }

      if (spec.topic !== event.topic) {
        issues.push({
          code: 'TOPIC_MISMATCH',
          severity: 'error',
          message: `Event ${event.name} emitted on topic ${event.topic} but spec expects ${spec.topic}`,
          eventName: event.name,
        });
      }

      for (const field of spec.requiredFields) {
        if (!(field in event.payload)) {
          issues.push({
            code: 'MISSING_REQUIRED_FIELD',
            severity: 'error',
            message: `Event ${event.name} is missing required field ${field}`,
            eventName: event.name,
          });
        }
      }
    }

    for (const spec of this.specs) {
      const seen = counts.get(spec.name) ?? 0;
      const isRequired = spec.required ?? true;

      if (isRequired && seen === 0) {
        issues.push({
          code: 'MISSING_REQUIRED_EVENT',
          severity: 'error',
          message: `Required event ${spec.name} was not emitted`,
          eventName: spec.name,
        });
      }

      const max = spec.maxOccurrences ?? 1;
      if (seen > max) {
        issues.push({
          code: 'DUPLICATE_EVENT',
          severity: 'error',
          message: `Event ${spec.name} emitted ${seen} times but at most ${max} is allowed`,
          eventName: spec.name,
        });
      }
    }

    issues.push(...this.checkOrdering(events));

    return {
      consistent: issues.every((issue) => issue.severity !== 'error'),
      issues,
    };
  }

  private checkOrdering(events: ObservedSorobanEvent[]): EventConsistencyIssue[] {
    const issues: EventConsistencyIssue[] = [];
    let highest = -Infinity;

    for (const event of events) {
      const spec = this.specsByName.get(event.name);
      if (!spec) continue;

      if (spec.order < highest) {
        issues.push({
          code: 'EVENT_OUT_OF_ORDER',
          severity: 'error',
          message: `Event ${event.name} appeared after an event that should follow it`,
          eventName: event.name,
        });
        continue;
      }

      highest = spec.order;
    }

    return issues;
  }
}
