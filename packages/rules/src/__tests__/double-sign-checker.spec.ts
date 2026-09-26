import { DoubleSignChecker } from "../double-sign-checker";
import { AttestationRecord } from "../types";

function makeAttestation(overrides: Partial<AttestationRecord> = {}): AttestationRecord {
  return {
    messageRoot: "0xabc123",
    sequenceNumber: 1,
    blockHeight: 1000,
    relayerKey: "relayer1",
    signature: "sig_abc123",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("DoubleSignChecker", () => {
  let checker: DoubleSignChecker;

  beforeEach(() => {
    checker = new DoubleSignChecker();
  });

  describe("recordAttestation", () => {
    it("returns null for a new attestation without conflict", () => {
      const result = checker.recordAttestation(makeAttestation());
      expect(result).toBeNull();
    });

    it("returns null when same message root is re-attested", () => {
      const att = makeAttestation();
      checker.recordAttestation(att);
      const result = checker.recordAttestation(att);
      expect(result).toBeNull();
    });

    it("returns a DoubleSignEvent on conflicting message root for same sequence", () => {
      checker.recordAttestation(makeAttestation({ messageRoot: "0xabc" }));
      const event = checker.recordAttestation(
        makeAttestation({ messageRoot: "0xdef" }),
      );
      expect(event).not.toBeNull();
      expect(event!.relayerKey).toBe("relayer1");
      expect(event!.priorAttestation.messageRoot).toBe("0xabc");
      expect(event!.conflictingAttestation.messageRoot).toBe("0xdef");
    });

    it("treats different relayers independently", () => {
      checker.recordAttestation(
        makeAttestation({ relayerKey: "relayerA", sequenceNumber: 1, messageRoot: "0xabc" }),
      );
      const result = checker.recordAttestation(
        makeAttestation({ relayerKey: "relayerB", sequenceNumber: 1, messageRoot: "0xdef" }),
      );
      expect(result).toBeNull();
    });

    it("evicts oldest entry when max history is reached", () => {
      const smallChecker = new DoubleSignChecker({ maxHistorySize: 2 });

      smallChecker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0x1" }),
      );
      smallChecker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 2, messageRoot: "0x2" }),
      );
      smallChecker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 3, messageRoot: "0x3" }),
      );

      // r1:1 should have been evicted, so re-recording it should not conflict
      const result = smallChecker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xnew" }),
      );
      expect(result).toBeNull();
    });
  });

  describe("checkForConflict", () => {
    it("returns allow for a new sequence number", () => {
      const result = checker.checkForConflict("0xabc", 1, 1000, "relayer1");
      expect(result.verdict).toBe("allow");
    });

    it("returns allow for same message root on same sequence", () => {
      checker.recordAttestation(
        makeAttestation({ messageRoot: "0xabc", sequenceNumber: 1 }),
      );
      const result = checker.checkForConflict("0xabc", 1, 1000, "relayer1");
      expect(result.verdict).toBe("allow");
    });

    it("returns block for conflicting message root on same sequence", () => {
      checker.recordAttestation(
        makeAttestation({ messageRoot: "0xabc", sequenceNumber: 5 }),
      );
      const result = checker.checkForConflict("0xdef", 5, 1000, "relayer1");
      expect(result.verdict).toBe("block");
      expect(result.reason).toContain("Double-sign prevented");
    });
  });

  describe("getRiskReport", () => {
    it("returns zero risk for a clean relayer", () => {
      const report = checker.getRiskReport("relayer1");
      expect(report.doubleSignCount).toBe(0);
      expect(report.riskScore).toBe(0);
      expect(report.isAtRisk).toBe(false);
    });

    it("flags at-risk after double-sign", () => {
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xabc" }),
      );
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xdef" }),
      );
      const report = checker.getRiskReport("r1");
      expect(report.doubleSignCount).toBe(1);
      expect(report.riskScore).toBeGreaterThan(0);
    });

    it("returns recent events in the report", () => {
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xa" }),
      );
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xb" }),
      );
      const report = checker.getRiskReport("r1");
      expect(report.recentEvents.length).toBe(1);
    });
  });

  describe("getDoubleSignEvents", () => {
    it("returns all events", () => {
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xa" }),
      );
      checker.recordAttestation(
        makeAttestation({ relayerKey: "r1", sequenceNumber: 1, messageRoot: "0xb" }),
      );
      expect(checker.getDoubleSignEvents().length).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      checker.recordAttestation(makeAttestation());
      checker.reset();
      expect(checker.getDoubleSignEvents().length).toBe(0);
      const report = checker.getRiskReport("relayer1");
      expect(report.totalAttestations).toBe(0);
    });
  });
});
