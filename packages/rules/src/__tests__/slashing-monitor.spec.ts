import { DoubleSignChecker } from "../double-sign-checker";
import { SlashingMonitor } from "../slashing-monitor";
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

describe("SlashingMonitor", () => {
  let checker: DoubleSignChecker;
  let monitor: SlashingMonitor;

  beforeEach(() => {
    checker = new DoubleSignChecker();
    monitor = new SlashingMonitor(checker);
  });

  afterEach(() => {
    monitor.reset();
  });

  describe("verifyBeforeSign", () => {
    it("allows a new attestation", () => {
      const result = monitor.verifyBeforeSign(
        makeAttestation({ sequenceNumber: 1, messageRoot: "0xabc" }),
      );
      expect(result.verdict).toBe("allow");
    });

    it("blocks a conflicting attestation", () => {
      // First, record a legit attestation
      monitor.recordAttestation(
        makeAttestation({ sequenceNumber: 5, messageRoot: "0xabc" }),
      );

      // Then attempt to sign a conflicting one for the same sequence
      const result = monitor.verifyBeforeSign(
        makeAttestation({ sequenceNumber: 5, messageRoot: "0xdef" }),
      );
      expect(result.verdict).toBe("block");
      expect(result.reason).toContain("Double-sign");
    });
  });

  describe("recordAttestation", () => {
    it("emits double-sign event on conflict", () => {
      const spy = jest.fn();
      monitor.on("double-sign", spy);

      monitor.recordAttestation(
        makeAttestation({ sequenceNumber: 1, messageRoot: "0xabc" }),
      );
      expect(spy).not.toHaveBeenCalled();

      monitor.recordAttestation(
        makeAttestation({ sequenceNumber: 1, messageRoot: "0xdef" }),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ relayerKey: "relayer1" }),
      );
    });

    it("emits attestation-blocked when verifyBeforeSign blocks", () => {
      const spy = jest.fn();
      monitor.on("attestation-blocked", spy);

      monitor.recordAttestation(
        makeAttestation({ sequenceNumber: 10, messageRoot: "0xabc" }),
      );

      monitor.verifyBeforeSign(
        makeAttestation({ sequenceNumber: 10, messageRoot: "0xdef" }),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ verdict: "block" }),
      );
    });
  });

  describe("getRiskReport", () => {
    it("returns a valid report for a relayer", () => {
      const report = monitor.getRiskReport("relayer1");
      expect(report).toHaveProperty("relayerKey", "relayer1");
      expect(report).toHaveProperty("riskScore");
      expect(report).toHaveProperty("isAtRisk");
    });
  });

  describe("addRelayer / removeRelayer", () => {
    it("adds and removes relayers without errors", () => {
      monitor.addRelayer("relayerA");
      monitor.removeRelayer("relayerA");
    });
  });

  describe("startMonitoring / stopMonitoring", () => {
    it("starts and stops without errors", () => {
      monitor.startMonitoring(5000);
      monitor.stopMonitoring();
    });

    it("does not start multiple timers", () => {
      monitor.startMonitoring(5000);
      const timer1 = (monitor as any).monitorTimer;
      monitor.startMonitoring(5000);
      const timer2 = (monitor as any).monitorTimer;
      expect(timer1).toBe(timer2);
      monitor.stopMonitoring();
    });
  });

  describe("reset", () => {
    it("clears all state and stops monitoring", () => {
      monitor.recordAttestation(makeAttestation());
      monitor.startMonitoring(5000);
      monitor.reset();

      expect(monitor.getRiskReport("relayer1").totalAttestations).toBe(0);
      expect((monitor as any).monitorTimer).toBeNull();
    });
  });
});
