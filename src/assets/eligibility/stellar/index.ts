/**
 * Stellar Asset Eligibility Validator (Issue #447)
 *
 * @example
 * ```ts
 * import { StellarAssetEligibilityValidator } from 'src/assets/eligibility/stellar';
 *
 * const validator = new StellarAssetEligibilityValidator({
 *   supportedAssetCodes: ['USDC', 'USDT'],
 *   restrictedIssuers: ['GBADISSUER...'],
 * });
 *
 * validator.isEligible('USDC:GA5Z...');     // true
 * validator.filterEligible(candidateAssets); // drop unsupported/restricted
 * ```
 */

export * from './types';
export { StellarAssetEligibilityValidator } from './validator';
