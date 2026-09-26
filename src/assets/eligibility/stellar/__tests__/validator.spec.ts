/**
 * Stellar Asset Eligibility Validator — Tests (Issue #447)
 */

import { StellarAssetEligibilityValidator } from '../index';

// Well-formed Stellar issuer strkeys: 'G' + 55 base32 chars [A-Z2-7].
const ISSUER = 'G' + 'A'.repeat(55);
const OTHER_ISSUER = 'G' + 'B'.repeat(55);

describe('StellarAssetEligibilityValidator', () => {
  describe('eligible assets', () => {
    it('accepts native XLM by default', () => {
      const v = new StellarAssetEligibilityValidator();
      const result = v.validate('XLM');
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('eligible');
      expect(result.issues).toHaveLength(0);
    });

    it('treats "native" as XLM', () => {
      expect(new StellarAssetEligibilityValidator().isEligible('native')).toBe(true);
    });

    it('accepts a supported asset with a valid issuer', () => {
      const v = new StellarAssetEligibilityValidator();
      const result = v.validate(`USDC:${ISSUER}`);
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('eligible');
      expect(result.asset).toEqual({ code: 'USDC', issuer: ISSUER });
    });
  });

  describe('unsupported assets are rejected', () => {
    it('rejects an unlisted asset by default', () => {
      const v = new StellarAssetEligibilityValidator();
      const result = v.validate(`FOO:${ISSUER}`);
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('unsupported');
      expect(result.issues[0].code).toBe('ASSET_UNSUPPORTED');
    });

    it('allows unlisted assets only when configured to', () => {
      const v = new StellarAssetEligibilityValidator({ allowUnlistedAssets: true });
      expect(v.isEligible(`FOO:${ISSUER}`)).toBe(true);
    });

    it('rejects native XLM when allowNative is false', () => {
      const v = new StellarAssetEligibilityValidator({ allowNative: false });
      const result = v.validate('XLM');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('unsupported');
      expect(result.issues[0].code).toBe('NATIVE_NOT_ELIGIBLE');
    });
  });

  describe('restricted assets are detected', () => {
    it('rejects a restricted asset code (takes precedence over support)', () => {
      const v = new StellarAssetEligibilityValidator({ restrictedAssetCodes: ['USDC'] });
      const result = v.validate(`USDC:${ISSUER}`);
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('restricted');
      expect(result.issues.map((i) => i.code)).toContain('ASSET_RESTRICTED');
    });

    it('rejects a restricted issuer', () => {
      const v = new StellarAssetEligibilityValidator({ restrictedIssuers: [ISSUER] });
      const result = v.validate(`USDC:${ISSUER}`);
      expect(result.status).toBe('restricted');
      expect(result.issues.map((i) => i.code)).toContain('ISSUER_RESTRICTED');
    });
  });

  describe('invalid identifiers', () => {
    it('rejects an unparseable identifier', () => {
      const v = new StellarAssetEligibilityValidator();
      const result = v.validate('USDC:not-a-valid-issuer');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('invalid');
      expect(result.issues[0].code).toBe('INVALID_ASSET_FORMAT');
      expect(result.asset).toBeNull();
    });

    it('rejects a non-native asset missing an issuer when required', () => {
      const v = new StellarAssetEligibilityValidator();
      const result = v.validate('USDC');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('invalid');
      expect(result.issues[0].code).toBe('MISSING_ISSUER');
    });

    it('allows a non-native asset without issuer when not required', () => {
      const v = new StellarAssetEligibilityValidator({ requireIssuerForNonNative: false });
      expect(v.isEligible('USDC')).toBe(true);
    });
  });

  describe('batch helpers', () => {
    it('filterEligible keeps only eligible identifiers', () => {
      const v = new StellarAssetEligibilityValidator();
      const candidates = ['XLM', `USDC:${ISSUER}`, `FOO:${OTHER_ISSUER}`, 'USDC'];
      expect(v.filterEligible(candidates)).toEqual(['XLM', `USDC:${ISSUER}`]);
    });

    it('validateMany returns a result per input', () => {
      const v = new StellarAssetEligibilityValidator();
      const results = v.validateMany(['XLM', `FOO:${ISSUER}`]);
      expect(results).toHaveLength(2);
      expect(results[0].eligible).toBe(true);
      expect(results[1].eligible).toBe(false);
    });
  });
});
