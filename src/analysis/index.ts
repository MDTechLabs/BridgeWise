export { analyzeStellarFailure, formatFailureForLog } from './failures/stellar/analyzer';
export { parseStellarFailure, resolveFailureCode } from './failures/stellar/parse'; // ← add the 'r'
export type {
  StellarFailureCode,
  StellarFailureResponse,
  ParsedFailure,
  FailureAnalysisResult,
} from './failures/stellar/types';
export * from './bridge-hotspots';