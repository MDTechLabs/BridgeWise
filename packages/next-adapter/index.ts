// Re-export everything from the core UI components for convenience.
export * from '@bridgewise/ui-components';

// Next.js-specific dynamic imports (SSR disabled).
export { BridgeStatusDynamic, BridgeCompareDynamic, ClientOnlyDynamic } from './dynamic';
