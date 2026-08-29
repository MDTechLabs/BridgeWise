```ts
/**
 * Soroban Multi-Contract Invocation Planner
 *
 * Standalone planning module for complex Soroban bridge workflows.
 *
 * This module intentionally has no dependencies on the existing BridgeWise
 * implementation. It can therefore be introduced and tested independently
 * before being connected to the transaction/invocation layer.
 *
 * Responsibilities:
 * - Define ordered Soroban contract invocation steps.
 * - Validate dependencies between calls.
 * - Detect invalid execution sequences.
 * - Detect dependency cycles.
 * - Produce an executable transaction plan.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type InvocationStepId = string;

export interface SorobanInvocation {
  /** Target Soroban contract address. */
  contractAddress: string;

  /** Contract method/function to invoke. */
  functionName: string;

  /** Arguments passed to the contract invocation. */
  args: unknown[];

  /**
   * Optional symbolic description of the invocation.
   * Useful for debugging and transaction-plan inspection.
   */
  description?: string;
}

export interface SorobanInvocationStep {
  /** Unique identifier for this invocation step. */
  id: InvocationStepId;

  /** Invocation that should be executed. */
  invocation: SorobanInvocation;

  /**
   * IDs of steps that must successfully execute before this step.
   */
  dependsOn?: InvocationStepId[];

  /**
   * Optional explicit execution order.
   *
   * Lower values execute earlier.
   * Dependency ordering always takes precedence.
   */
  order?: number;

  /**
   * Whether this step is required for the plan to succeed.
   *
   * Defaults to true.
   */
  required?: boolean;
}

export interface SorobanInvocationPlan {
  /** Ordered executable steps. */
  steps: SorobanInvocationStep[];

  /** Number of steps in the plan. */
  stepCount: number;

  /** IDs in their final execution order. */
  executionOrder: InvocationStepId[];

  /** Whether all dependencies are valid. */
  valid: boolean;
}

export type InvocationPlanningErrorCode =
  | 'EMPTY_PLAN'
  | 'DUPLICATE_STEP_ID'
  | 'MISSING_DEPENDENCY'
  | 'SELF_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'INVALID_CONTRACT_ADDRESS'
  | 'INVALID_FUNCTION_NAME'
  | 'INVALID_ORDER'
  | 'INVALID_ARGUMENTS';

export interface InvocationPlanningError {
  code: InvocationPlanningErrorCode;
  message: string;
  stepId?: InvocationStepId;
  dependencyId?: InvocationStepId;
}

export interface InvocationPlanningResult {
  success: boolean;
  plan: SorobanInvocationPlan | null;
  errors: InvocationPlanningError[];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a single Soroban invocation step.
 */
export function validateInvocationStep(
  step: SorobanInvocationStep,
): InvocationPlanningError[] {
  const errors: InvocationPlanningError[] = [];

  if (!step.id || step.id.trim().length === 0) {
    errors.push({
      code: 'DUPLICATE_STEP_ID',
      message: 'Invocation step must have a non-empty ID.',
      stepId: step.id,
    });
  }

  if (
    !step.invocation.contractAddress ||
    step.invocation.contractAddress.trim().length === 0
  ) {
    errors.push({
      code: 'INVALID_CONTRACT_ADDRESS',
      message: 'Soroban contract address must not be empty.',
      stepId: step.id,
    });
  }

  if (
    !step.invocation.functionName ||
    step.invocation.functionName.trim().length === 0
  ) {
    errors.push({
      code: 'INVALID_FUNCTION_NAME',
      message: 'Soroban function name must not be empty.',
      stepId: step.id,
    });
  }

  if (!Array.isArray(step.invocation.args)) {
    errors.push({
      code: 'INVALID_ARGUMENTS',
      message: 'Invocation arguments must be an array.',
      stepId: step.id,
    });
  }

  if (
    step.order !== undefined &&
    (!Number.isFinite(step.order) || step.order < 0)
  ) {
    errors.push({
      code: 'INVALID_ORDER',
      message: 'Invocation order must be a finite non-negative number.',
      stepId: step.id,
    });
  }

  return errors;
}

/**
 * Ensure all step IDs are unique.
 */
export function validateUniqueStepIds(
  steps: SorobanInvocationStep[],
): InvocationPlanningError[] {
  const errors: InvocationPlanningError[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    if (seen.has(step.id)) {
      errors.push({
        code: 'DUPLICATE_STEP_ID',
        message: `Duplicate invocation step ID: "${step.id}".`,
        stepId: step.id,
      });
    }

    seen.add(step.id);
  }

  return errors;
}

/**
 * Validate that every dependency points to an existing step.
 */
export function validateDependencies(
  steps: SorobanInvocationStep[],
): InvocationPlanningError[] {
  const errors: InvocationPlanningError[] = [];
  const stepIds = new Set(steps.map((step) => step.id));

  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === step.id) {
        errors.push({
          code: 'SELF_DEPENDENCY',
          message: `Step "${step.id}" cannot depend on itself.`,
          stepId: step.id,
          dependencyId: dependency,
        });
        continue;
      }

      if (!stepIds.has(dependency)) {
        errors.push({
          code: 'MISSING_DEPENDENCY',
          message: `Step "${step.id}" depends on missing step "${dependency}".`,
          stepId: step.id,
          dependencyId: dependency,
        });
      }
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Dependency Graph                                                           */
/* -------------------------------------------------------------------------- */

function createStepMap(
  steps: SorobanInvocationStep[],
): Map<InvocationStepId, SorobanInvocationStep> {
  return new Map(steps.map((step) => [step.id, step]));
}

/**
 * Detect dependency cycles using depth-first traversal.
 */
export function detectDependencyCycles(
  steps: SorobanInvocationStep[],
): InvocationPlanningError[] {
  const errors: InvocationPlanningError[] = [];
  const stepMap = createStepMap(steps);

  const visiting = new Set<InvocationStepId>();
  const visited = new Set<InvocationStepId>();

  function visit(stepId: InvocationStepId): boolean {
    if (visiting.has(stepId)) {
      errors.push({
        code: 'DEPENDENCY_CYCLE',
        message: `Dependency cycle detected involving step "${stepId}".`,
        stepId,
      });

      return true;
    }

    if (visited.has(stepId)) {
      return false;
    }

    const step = stepMap.get(stepId);

    if (!step) {
      return false;
    }

    visiting.add(stepId);

    for (const dependency of step.dependsOn ?? []) {
      if (visit(dependency)) {
        return true;
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);

    return false;
  }

  for (const step of steps) {
    visit(step.id);
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Execution Planning                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Topologically sort invocation steps according to their dependencies.
 *
 * Dependencies always execute before dependent steps.
 *
 * For independent steps, explicit `order` values are respected.
 * When no order is provided, the original declaration order is used.
 */
export function orderInvocationSteps(
  steps: SorobanInvocationStep[],
): SorobanInvocationStep[] {
  const stepMap = createStepMap(steps);

  const declarationIndex = new Map(
    steps.map((step, index) => [step.id, index]),
  );

  const ordered: SorobanInvocationStep[] = [];
  const visited = new Set<InvocationStepId>();

  function visit(stepId: InvocationStepId): void {
    if (visited.has(stepId)) {
      return;
    }

    const step = stepMap.get(stepId);

    if (!step) {
      return;
    }

    visited.add(stepId);

    const dependencies = [...(step.dependsOn ?? [])];

    dependencies.sort((a, b) => {
      const stepA = stepMap.get(a);
      const stepB = stepMap.get(b);

      const orderA = stepA?.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = stepB?.order ?? Number.MAX_SAFE_INTEGER;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return (
        (declarationIndex.get(a) ?? 0) -
        (declarationIndex.get(b) ?? 0)
      );
    });

    for (const dependency of dependencies) {
      visit(dependency);
    }

    ordered.push(step);
  }

  const roots = [...steps].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return (
      (declarationIndex.get(a.id) ?? 0) -
      (declarationIndex.get(b.id) ?? 0)
    );
  });

  for (const step of roots) {
    visit(step.id);
  }

  return ordered;
}

/* -------------------------------------------------------------------------- */
/* Plan Creation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Create a validated executable Soroban invocation plan.
 *
 * The planner rejects:
 * - empty plans
 * - duplicate step IDs
 * - missing dependencies
 * - self dependencies
 * - circular dependencies
 * - invalid invocation definitions
 * - invalid explicit ordering
 */
export function createSorobanInvocationPlan(
  steps: SorobanInvocationStep[],
): InvocationPlanningResult {
  if (steps.length === 0) {
    return {
      success: false,
      plan: null,
      errors: [
        {
          code: 'EMPTY_PLAN',
          message: 'At least one invocation step is required.',
        },
      ],
    };
  }

  const errors: InvocationPlanningError[] = [];

  for (const step of steps) {
    errors.push(...validateInvocationStep(step));
  }

  errors.push(...validateUniqueStepIds(steps));
  errors.push(...validateDependencies(steps));

  /*
   * Only attempt cycle detection when the basic dependency graph
   * is structurally valid.
   */
  if (
    !errors.some(
      (error) =>
        error.code === 'DUPLICATE_STEP_ID' ||
        error.code === 'MISSING_DEPENDENCY' ||
        error.code === 'SELF_DEPENDENCY',
    )
  ) {
    errors.push(...detectDependencyCycles(steps));
  }

  if (errors.length > 0) {
    return {
      success: false,
      plan: null,
      errors,
    };
  }

  const orderedSteps = orderInvocationSteps(steps);

  return {
    success: true,
    plan: {
      steps: orderedSteps,
      stepCount: orderedSteps.length,
      executionOrder: orderedSteps.map((step) => step.id),
      valid: true,
    },
    errors: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Plan Inspection Helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether a step can execute based on completed steps.
 */
export function canExecuteStep(
  step: SorobanInvocationStep,
  completedSteps: Set<InvocationStepId>,
): boolean {
  return (step.dependsOn ?? []).every((dependency) =>
    completedSteps.has(dependency),
  );
}

/**
 * Return the steps that are currently executable.
 *
 * This is useful for consumers that execute a plan incrementally.
 */
export function getExecutableSteps(
  plan: SorobanInvocationPlan,
  completedSteps: Set<InvocationStepId> = new Set(),
): SorobanInvocationStep[] {
  return plan.steps.filter(
    (step) =>
      !completedSteps.has(step.id) &&
      canExecuteStep(step, completedSteps),
  );
}

/**
 * Mark a plan step as completed and return a new completed-step set.
 */
export function completeInvocationStep(
  completedSteps: Set<InvocationStepId>,
  stepId: InvocationStepId,
): Set<InvocationStepId> {
  const updated = new Set(completedSteps);
  updated.add(stepId);
  return updated;
}

/**
 * Determine whether every step in a plan has completed successfully.
 */
export function isPlanComplete(
  plan: SorobanInvocationPlan,
  completedSteps: Set<InvocationStepId>,
): boolean {
  return plan.executionOrder.every((stepId) =>
    completedSteps.has(stepId),
  );
}

/**
 * Return a serializable representation suitable for transaction-building
 * layers.
 */
export function toExecutableInvocations(
  plan: SorobanInvocationPlan,
): SorobanInvocation[] {
  return plan.steps.map((step) => step.invocation);
}
```
