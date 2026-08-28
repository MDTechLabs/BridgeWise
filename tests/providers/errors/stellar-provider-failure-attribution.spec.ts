import type { StellarBridgeProviderError } from '../../../src/providers/stellar/interfaces/stellar-bridge-provider-adapter.interface';
import { StellarProviderDependencyGraph } from '../../../src/providers/dependencies/stellar';
import { attributeProviderFailure } from '../../../src/diagnostics/providers';

const FIXED_NOW = 1_700_000_000_000;

function makeError(
  overrides: Partial<StellarBridgeProviderError> = {},
): StellarBridgeProviderError {
  return {
    providerId: 'alpha',
    operation: 'quote',
    code: 'UNKNOWN',
    message: 'provider failure',
    retryable: false,
    ...overrides,
  };
}

function graphWithSharedRpc() {
  const graph = new StellarProviderDependencyGraph({ now: () => FIXED_NOW });

  graph.addDependency({
    id: 'rpc-main',
    kind: 'rpc',
    label: 'Soroban RPC',
    critical: true,
  });
  graph.addDependency({
    id: 'pool-a',
    kind: 'contract',
    label: 'Pool A',
    critical: true,
  });
  graph.addDependency({
    id: 'liquidity-feed',
    kind: 'liquidity',
    label: 'Liquidity API',
    critical: true,
  });
  graph.addDependency({
    id: 'prices',
    kind: 'api',
    label: 'Price API',
    critical: false,
  });

  graph.addProvider({
    id: 'alpha',
    name: 'Alpha Bridge',
    dependencyIds: ['rpc-main', 'pool-a', 'liquidity-feed'],
  });
  graph.addProvider({
    id: 'beta',
    name: 'Beta Bridge',
    dependencyIds: ['rpc-main', 'prices'],
  });

  return graph;
}

function allHealthy(graph: StellarProviderDependencyGraph) {
  for (const dependency of graph.listDependencies()) {
    graph.recordDependencyHealth(dependency.id, 'healthy');
  }
}

describe('attributeProviderFailure (#1069)', () => {
  const now = () => FIXED_NOW;

  it('attributes TIMEOUT as rpc', () => {
    const error = makeError({
      code: 'TIMEOUT',
      message: 'request timed out',
      retryable: true,
    });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.failureClass).toBe('rpc');
    expect(diagnostic.code).toBe('TIMEOUT');
    expect(diagnostic.attributedAt).toBe(FIXED_NOW);
  });

  it('attributes QUOTE_FAILED with liquidity signals as liquidity', () => {
    const error = makeError({
      code: 'QUOTE_FAILED',
      message: 'insufficient liquidity for requested amount',
      retryable: false,
    });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.failureClass).toBe('liquidity');
    expect(diagnostic.code).toBe('QUOTE_FAILED');
  });

  it.each([
    ['INVALID_REQUEST', 'invalid request parameters'],
    ['UNSUPPORTED_ROUTE', 'route not supported for this asset pair'],
  ] as const)('attributes %s as configuration', (code, message) => {
    const error = makeError({ code, message, retryable: false });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.failureClass).toBe('configuration');
    expect(diagnostic.code).toBe(code);
  });

  it.each([
    ['EXECUTION_FAILED', 'transaction submission failed'],
    ['STATUS_FAILED', 'status polling failed'],
  ] as const)('attributes %s as execution', (code, message) => {
    const error = makeError({ code, message, retryable: true });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.failureClass).toBe('execution');
    expect(diagnostic.code).toBe(code);
  });

  it('attributes an unhealthy rpc dependency when dependency context is provided', () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);
    graph.recordDependencyHealth('rpc-main', 'unhealthy', 'connection refused');

    const error = makeError({
      code: 'TIMEOUT',
      message: 'request timed out',
      providerId: 'alpha',
      retryable: true,
    });

    const diagnostic = attributeProviderFailure(error, {
      dependencyGraph: graph,
      now,
    });

    expect(diagnostic.failureClass).toBe('rpc');
    expect(diagnostic.dependency).toEqual({
      dependencyId: 'rpc-main',
      kind: 'rpc',
      label: 'Soroban RPC',
      status: 'unhealthy',
      reason: 'connection refused',
    });
  });

  it('attributes an unhealthy liquidity dependency when dependency context is provided', () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);
    graph.recordDependencyHealth(
      'liquidity-feed',
      'unhealthy',
      'insufficient liquidity',
    );

    const error = makeError({
      code: 'QUOTE_FAILED',
      message: 'insufficient liquidity for quote request',
      providerId: 'alpha',
      retryable: false,
    });

    const diagnostic = attributeProviderFailure(error, {
      dependencyGraph: graph,
      now,
    });

    expect(diagnostic.failureClass).toBe('liquidity');
    expect(diagnostic.dependency).toMatchObject({
      dependencyId: 'liquidity-feed',
      kind: 'liquidity',
      status: 'unhealthy',
      reason: 'insufficient liquidity',
    });
  });

  it('preserves provider-specific error codes from details', () => {
    const error = makeError({
      code: 'EXECUTION_FAILED',
      details: { providerErrorCode: 'SOME_PROVIDER_CODE' },
    });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.details?.providerErrorCode).toBe('SOME_PROVIDER_CODE');
  });

  it('does not overwrite an existing providerErrorCode in details', () => {
    const error = makeError({
      details: { providerErrorCode: 'EXISTING_CODE' },
    });

    const diagnostic = attributeProviderFailure(error, {
      now,
      rawError: { code: 'RAW_CODE' },
    });

    expect(diagnostic.details?.providerErrorCode).toBe('EXISTING_CODE');
  });

  it.each([
    'PROVIDER_UNAVAILABLE',
    'TIMEOUT',
    'QUOTE_FAILED',
    'EXECUTION_FAILED',
  ] as const)('preserves original provider error code %s', (code) => {
    const error = makeError({ code, message: `${code} occurred` });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.code).toBe(code);
  });

  it('preserves provider error fields on the diagnostic', () => {
    const error = makeError({
      providerId: 'beta',
      operation: 'execution',
      code: 'STATUS_FAILED',
      message: 'status unavailable',
      retryable: true,
      details: { requestId: 'req-42' },
    });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic).toMatchObject({
      providerId: 'beta',
      operation: 'execution',
      code: 'STATUS_FAILED',
      retryable: true,
      message: 'status unavailable',
      details: { requestId: 'req-42' },
    });
  });

  it('preserves retryability without overriding provider decisions', () => {
    const retryableError = makeError({ code: 'TIMEOUT', retryable: true });
    const permanentError = makeError({ code: 'INVALID_REQUEST', retryable: false });

    expect(attributeProviderFailure(retryableError, { now }).retryable).toBe(true);
    expect(attributeProviderFailure(permanentError, { now }).retryable).toBe(false);
  });

  it('attributes UNKNOWN without secondary signals as unknown', () => {
    const error = makeError({
      code: 'UNKNOWN',
      message: 'something went wrong',
      retryable: false,
    });

    const diagnostic = attributeProviderFailure(error, { now });

    expect(diagnostic.failureClass).toBe('unknown');
    expect(diagnostic.code).toBe('UNKNOWN');
  });

  it('extracts providerErrorCode from rawError when details do not include one', () => {
    const error = makeError({ code: 'UNKNOWN', message: 'provider rejected request' });

    const diagnostic = attributeProviderFailure(error, {
      now,
      rawError: { code: 'UPSTREAM_429' },
    });

    expect(diagnostic.details?.providerErrorCode).toBe('UPSTREAM_429');
  });

  it('omits dependency when the provider is not registered in the graph', () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    const error = makeError({
      providerId: 'missing-provider',
      code: 'TIMEOUT',
      retryable: true,
    });

    const diagnostic = attributeProviderFailure(error, {
      dependencyGraph: graph,
      now,
    });

    expect(diagnostic.dependency).toBeUndefined();
    expect(diagnostic.failureClass).toBe('rpc');
  });
});
