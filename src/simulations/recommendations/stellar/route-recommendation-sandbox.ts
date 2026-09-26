export interface SandboxScenario {
  id: string;
  name: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  amount: number;
}

export interface SandboxResult {
  scenarioId: string;
  recommendedRoute: string;
  estimatedFee: number;
  estimatedLatencyMs: number;
  confidence: number;
}

const scenarios: SandboxScenario[] = [];
const results: SandboxResult[] = [];

export function createScenario(scenario: Omit<SandboxScenario, 'id'>): SandboxScenario {
  const newScenario: SandboxScenario = { id: crypto.randomUUID(), ...scenario };
  scenarios.push(newScenario);
  return newScenario;
}

export function recommendRoute(scenarioId: string): SandboxResult | null {
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) return null;
  const result: SandboxResult = {
    scenarioId,
    recommendedRoute: `${scenario.sourceChain} → ${scenario.destChain} via ${scenario.asset}`,
    estimatedFee: scenario.amount * 0.003 + 0.5,
    estimatedLatencyMs: Math.floor(Math.random() * 5000) + 1000,
    confidence: 0.85 + Math.random() * 0.15,
  };
  results.push(result);
  return result;
}

export function getScenarioHistory(): SandboxScenario[] {
  return [...scenarios];
}
