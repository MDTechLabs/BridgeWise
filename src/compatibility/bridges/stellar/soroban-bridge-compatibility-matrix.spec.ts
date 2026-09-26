import { SorobanBridgeCompatibilityMatrix } from './soroban-bridge-compatibility-matrix';
import {
  BridgeProviderRecord,
  SorobanApplication,
} from './soroban-bridge-compatibility-matrix.types';

const APP_DEX: SorobanApplication = {
  id: 'C_DEX_1',
  name: 'SorobanDEX',
  type: 'dex',
  features: ['SEP-41', 'swap'],
};

const APP_LENDING: SorobanApplication = {
  id: 'C_LEND_1',
  name: 'StellarLend',
  type: 'lending',
  features: ['SEP-41', 'deposit', 'borrow'],
};

const APP_BRIDGE: SorobanApplication = {
  id: 'C_BRIDGE_1',
  name: 'StellarBridge',
  type: 'bridge',
  features: ['SEP-41', 'transfer', 'lock'],
};

const PROVIDER_ALLBRIDGE: BridgeProviderRecord = {
  id: 'allbridge',
  name: 'Allbridge',
  supportedChains: ['stellar', 'ethereum'],
  supportedAssets: ['USDC', 'XLM'],
  features: ['SEP-41', 'transfer'],
};

const PROVIDER_SQUID: BridgeProviderRecord = {
  id: 'squid',
  name: 'Squid Router',
  supportedChains: ['stellar', 'ethereum', 'polygon'],
  supportedAssets: ['USDC'],
  features: ['SEP-41', 'transfer', 'swap'],
};

const PROVIDER_WORMHOLE: BridgeProviderRecord = {
  id: 'wormhole',
  name: 'Wormhole',
  supportedChains: ['stellar'],
  supportedAssets: ['XLM'],
  features: ['SEP-41'],
};

describe('SorobanBridgeCompatibilityMatrix', () => {
  let matrix: SorobanBridgeCompatibilityMatrix;

  beforeEach(() => {
    matrix = new SorobanBridgeCompatibilityMatrix(() => 1_700_000_000_000);
  });

  // ─── Registration ────────────────────────────────────────────────────────

  describe('registration', () => {
    it('registers a single application and a single provider', () => {
      matrix.registerApplication(APP_DEX);
      matrix.registerProvider(PROVIDER_ALLBRIDGE);

      expect(matrix.getApplications()).toEqual([APP_DEX]);
      expect(matrix.getProviders()).toEqual([PROVIDER_ALLBRIDGE]);
    });

    it('registers many applications and providers at once', () => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);

      expect(matrix.getApplications()).toHaveLength(2);
      expect(matrix.getProviders()).toHaveLength(2);
    });

    it('overwrites an existing application on re-registration', () => {
      matrix.registerApplication(APP_DEX);
      matrix.registerApplication({ ...APP_DEX, version: '2.0' });

      const apps = matrix.getApplications();
      expect(apps).toHaveLength(1);
      expect(apps[0].version).toBe('2.0');
    });

    it('removes an application and cascades to delete its records', () => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });

      expect(matrix.getAllRecords()).toHaveLength(1);

      expect(matrix.removeApplication(APP_DEX.id)).toBe(true);
      expect(matrix.getApplications()).toHaveLength(1);
      expect(matrix.getAllRecords()).toHaveLength(0);
    });

    it('removes a provider and cascades to delete its records', () => {
      matrix.registerApplications([APP_DEX]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });

      expect(matrix.removeProvider(PROVIDER_ALLBRIDGE.id)).toBe(true);
      expect(matrix.getProviders()).toHaveLength(0);
      expect(matrix.getAllRecords()).toHaveLength(0);
    });

    it('returns false when removing an unknown application or provider', () => {
      expect(matrix.removeApplication('nope')).toBe(false);
      expect(matrix.removeProvider('nope')).toBe(false);
    });
  });

  // ─── Records: upsert & remove ────────────────────────────────────────────

  describe('records', () => {
    beforeEach(() => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);
    });

    it('inserts a record and stamps scannedAt if missing', () => {
      const result = matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });

      expect(result.scannedAt).toBe(1_700_000_000_000);
      expect(matrix.getAllRecords()).toHaveLength(1);
    });

    it('overwrites an existing record on duplicate upsert', () => {
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['swap'],
        warnings: ['Missing swap feature'],
        notes: 'reviewed manually',
        scannedAt: 2_000,
      });

      const all = matrix.getAllRecords();
      expect(all).toHaveLength(1);
      expect(all[0].compatible).toBe(false);
      expect(all[0].notes).toBe('reviewed manually');
      expect(all[0].scannedAt).toBe(2_000);
    });

    it('removes a record by (application, provider) pair', () => {
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });

      expect(matrix.removeRecord(APP_DEX.id, PROVIDER_ALLBRIDGE.id)).toBe(true);
      expect(matrix.removeRecord(APP_DEX.id, PROVIDER_ALLBRIDGE.id)).toBe(false);
      expect(matrix.getAllRecords()).toHaveLength(0);
    });

    it('returns the same record from getRecord as from getAllRecords', () => {
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: true,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: [],
        warnings: [],
      });

      const fromGet = matrix.getRecord(APP_DEX.id, PROVIDER_ALLBRIDGE.id);
      const fromAll = matrix.getAllRecords()[0];

      expect(fromGet).toEqual(fromAll);
    });

    it('returns undefined from getRecord for an unknown pair', () => {
      expect(
        matrix.getRecord(APP_DEX.id, PROVIDER_ALLBRIDGE.id),
      ).toBeUndefined();
    });
  });

  // ─── scanAndUpsert ───────────────────────────────────────────────────────

  describe('scanAndUpsert', () => {
    it('marks compatible=true when all features are supported', () => {
      matrix.registerApplication(APP_DEX);
      matrix.registerProvider(PROVIDER_SQUID); // has SEP-41 + swap

      const record = matrix.scanAndUpsert(APP_DEX.id, PROVIDER_SQUID.id);

      expect(record).not.toBeNull();
      expect(record?.compatible).toBe(true);
      expect(record?.supportedFeatures).toEqual(['SEP-41', 'swap']);
      expect(record?.unsupportedFeatures).toEqual([]);
    });

    it('marks compatible=false and records warnings for missing features', () => {
      matrix.registerApplication(APP_DEX);
      matrix.registerProvider(PROVIDER_ALLBRIDGE); // lacks swap

      const record = matrix.scanAndUpsert(APP_DEX.id, PROVIDER_ALLBRIDGE.id);

      expect(record?.compatible).toBe(false);
      expect(record?.supportedFeatures).toEqual(['SEP-41']);
      expect(record?.unsupportedFeatures).toEqual(['swap']);
      expect(record?.warnings).toHaveLength(1);
      expect(record?.warnings[0]).toMatch(/swap/);
    });

    it('returns null when application or provider is missing', () => {
      matrix.registerApplication(APP_DEX);
      expect(matrix.scanAndUpsert(APP_DEX.id, 'unknown-provider')).toBeNull();

      matrix.registerProvider(PROVIDER_ALLBRIDGE);
      // APP_DEX still expecting to scan against a different provider — just confirm a missing application case too
      expect(matrix.scanAndUpsert('unknown-app', PROVIDER_ALLBRIDGE.id)).toBeNull();
    });
  });

  // ─── Query / isCompatible ─────────────────────────────────────────────────

  describe('query and isCompatible', () => {
    beforeEach(() => {
      matrix.registerApplications([APP_DEX, APP_LENDING, APP_BRIDGE]);
      matrix.registerProviders([
        PROVIDER_ALLBRIDGE,
        PROVIDER_SQUID,
        PROVIDER_WORMHOLE,
      ]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: ['SEP-41', 'swap'],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['swap'],
        warnings: ['missing swap'],
      });
      matrix.upsertRecord({
        applicationId: APP_LENDING.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['deposit', 'borrow'],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_BRIDGE.id,
        providerId: PROVIDER_WORMHOLE.id,
        compatible: true,
        supportedFeatures: ['SEP-41', 'transfer', 'lock'],
        unsupportedFeatures: [],
        warnings: [],
      });
    });

    it('returns compatible=true when the record exists and is compatible', () => {
      expect(
        matrix.isCompatible(APP_DEX.id, PROVIDER_SQUID.id),
      ).toBe(true);
    });

    it('returns compatible=false when the record exists and is incompatible', () => {
      expect(
        matrix.isCompatible(APP_DEX.id, PROVIDER_ALLBRIDGE.id),
      ).toBe(false);
    });

    it('returns compatible=false for unknown (app, provider) pairs', () => {
      const status = matrix.query({
        applicationId: APP_DEX.id,
        providerId: 'unknown',
      });
      expect(status.compatible).toBe(false);
      expect(status.record).toBeNull();
    });

    it('lists all providers for an application', () => {
      const records = matrix.getProvidersForApplication(APP_DEX.id);
      const providerIds = records.map((r) => r.providerId).sort();
      expect(providerIds).toEqual(['allbridge', 'squid']);
    });

    it('lists only compatible providers when compatibleOnly=true', () => {
      const records = matrix.getProvidersForApplication(APP_DEX.id, true);
      expect(records).toHaveLength(1);
      expect(records[0].providerId).toBe('squid');
    });

    it('lists all applications for a provider', () => {
      const records = matrix.getApplicationsForProvider(PROVIDER_ALLBRIDGE.id);
      const appIds = records.map((r) => r.applicationId).sort();
      expect(appIds).toEqual(['C_DEX_1', 'C_LEND_1']);
    });

    it('lists only compatible applications when compatibleOnly=true', () => {
      // PROVIDER_WORMHOLE only has BRIDGE compatibility
      const records = matrix.getApplicationsForProvider(PROVIDER_WORMHOLE.id, true);
      expect(records).toHaveLength(1);
      expect(records[0].applicationId).toBe('C_BRIDGE_1');
    });
  });

  // ─── Reports ─────────────────────────────────────────────────────────────

  describe('generateReport', () => {
    it('returns an empty report when nothing is registered', () => {
      const report = matrix.generateReport();

      expect(report.summary.totalApplications).toBe(0);
      expect(report.summary.totalProviders).toBe(0);
      expect(report.summary.totalRecords).toBe(0);
      expect(report.summary.compatibleRecords).toBe(0);
      expect(report.summary.incompatibleRecords).toBe(0);
      expect(report.summary.compatibilityRate).toBe(0);
      expect(report.byApplication).toEqual([]);
      expect(report.byProvider).toEqual([]);
      expect(report.incompatibilities).toEqual([]);
    });

    it('computes summary counts and compatibility rates', () => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: ['SEP-41', 'swap'],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['swap'],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_LENDING.id,
        providerId: PROVIDER_SQUID.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['deposit', 'borrow'],
        warnings: [],
      });

      const report = matrix.generateReport();

      expect(report.summary.totalApplications).toBe(2);
      expect(report.summary.totalProviders).toBe(2);
      expect(report.summary.totalRecords).toBe(3);
      expect(report.summary.compatibleRecords).toBe(1);
      expect(report.summary.incompatibleRecords).toBe(2);
      expect(report.summary.compatibilityRate).toBeCloseTo(1 / 3);
    });

    it('produces per-application breakdown with rates', () => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_LENDING.id,
        providerId: PROVIDER_SQUID.id,
        compatible: false,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });

      const report = matrix.generateReport();
      const dexEntry = report.byApplication.find((e) => e.applicationId === 'C_DEX_1');
      const lendingEntry = report.byApplication.find(
        (e) => e.applicationId === 'C_LEND_1',
      );

      expect(dexEntry?.providerCount).toBe(2);
      expect(dexEntry?.compatibleProviderCount).toBe(1);
      expect(dexEntry?.compatibilityRate).toBe(0.5);
      expect(lendingEntry?.providerCount).toBe(1);
      expect(lendingEntry?.compatibleProviderCount).toBe(0);
      expect(lendingEntry?.compatibilityRate).toBe(0);
    });

    it('produces per-provider breakdown', () => {
      matrix.registerApplications([APP_DEX, APP_LENDING]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_LENDING.id,
        providerId: PROVIDER_SQUID.id,
        compatible: false,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: [],
        unsupportedFeatures: [],
        warnings: [],
      });

      const report = matrix.generateReport();
      const squid = report.byProvider.find((p) => p.providerId === 'squid');
      const allbridge = report.byProvider.find((p) => p.providerId === 'allbridge');

      expect(squid?.applicationCount).toBe(2);
      expect(squid?.compatibleApplicationCount).toBe(1);
      expect(squid?.compatibilityRate).toBe(0.5);
      expect(allbridge?.applicationCount).toBe(1);
      expect(allbridge?.compatibleApplicationCount).toBe(0);
    });

    it('lists all incompatible records', () => {
      matrix.registerApplications([APP_DEX]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE, PROVIDER_SQUID]);
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: ['SEP-41', 'swap'],
        unsupportedFeatures: [],
        warnings: [],
      });
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_ALLBRIDGE.id,
        compatible: false,
        supportedFeatures: ['SEP-41'],
        unsupportedFeatures: ['swap'],
        warnings: ['missing swap'],
        notes: 'known-gap',
      });

      const report = matrix.generateReport();

      expect(report.incompatibilities).toHaveLength(1);
      expect(report.incompatibilities[0].providerId).toBe('allbridge');
      expect(report.incompatibilities[0].notes).toBe('known-gap');
    });

    it('rates are 0 when no records point at the entity', () => {
      matrix.registerApplications([APP_DEX]);
      matrix.registerProviders([PROVIDER_ALLBRIDGE]);

      const report = matrix.generateReport();

      const appEntry = report.byApplication[0];
      const providerEntry = report.byProvider[0];

      expect(appEntry.compatibilityRate).toBe(0);
      expect(appEntry.providerCount).toBe(0);
      expect(providerEntry.compatibilityRate).toBe(0);
      expect(providerEntry.applicationCount).toBe(0);
    });
  });

  // ─── Snapshot isolation ──────────────────────────────────────────────────

  describe('snapshot semantics', () => {
    it('getApplications returns a defensive copy', () => {
      matrix.registerApplication(APP_DEX);
      const snapshot = matrix.getApplications();
      snapshot.pop();
      expect(matrix.getApplications()).toHaveLength(1);
    });

    it('getProviders returns a defensive copy', () => {
      matrix.registerProvider(PROVIDER_ALLBRIDGE);
      const snapshot = matrix.getProviders();
      snapshot.pop();
      expect(matrix.getProviders()).toHaveLength(1);
    });

    it('upsertRecord stores defensive copies of arrays', () => {
      matrix.registerApplications([APP_DEX]);
      matrix.registerProviders([PROVIDER_SQUID]);

      const supported = ['SEP-41', 'swap'];
      const unsupported = [];
      matrix.upsertRecord({
        applicationId: APP_DEX.id,
        providerId: PROVIDER_SQUID.id,
        compatible: true,
        supportedFeatures: supported,
        unsupportedFeatures: unsupported,
        warnings: [],
      });

      supported.push('mutated');
      const record = matrix.getRecord(APP_DEX.id, PROVIDER_SQUID.id);
      expect(record?.supportedFeatures).toEqual(['SEP-41', 'swap']);
    });
  });
});
