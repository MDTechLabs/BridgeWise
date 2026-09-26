import { HeaderVerifier } from "../header-verifier";
import { SyncCommitteeVerifier } from "../sync-committee";
import { BlockHeader, BLSSignature, SyncCommittee } from "../types";

function makeHeader(overrides: Partial<BlockHeader> = {}): BlockHeader {
  return {
    slot: 100,
    proposerIndex: 42,
    parentRoot: "0x" + "aa".repeat(32),
    stateRoot: "0x" + "bb".repeat(32),
    bodyRoot: "0x" + "cc".repeat(32),
    signature: "0x" + "dd".repeat(96),
    ...overrides,
  };
}

function makeCommittee(overrides: Partial<SyncCommittee> = {}): SyncCommittee {
  return {
    pubkeys: Array(512).fill("0x" + "ee".repeat(48)),
    aggregatePubkey: "0x" + "ff".repeat(48),
    period: Math.floor(100 / 8192),
    participantsBits: "1".repeat(342) + "0".repeat(170),
    ...overrides,
  };
}

function makeBLSSignature(header: BlockHeader, committee: SyncCommittee, overrides: Partial<BLSSignature> = {}): BLSSignature {
  return {
    signature: "0x" + "99".repeat(96),
    committee,
    slot: header.slot,
    ...overrides,
  };
}

describe("HeaderVerifier", () => {
  let verifier: HeaderVerifier;

  beforeEach(() => {
    verifier = new HeaderVerifier();
  });

  describe("validateHeader", () => {
    it("validates a well-formed block header", () => {
      const header = makeHeader();
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(true);
      expect(result.slot).toBe(100);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects header with invalid stateRoot format", () => {
      const header = makeHeader({ stateRoot: "not-a-hex" });
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("stateRoot"))).toBe(true);
    });

    it("rejects header with negative slot", () => {
      const header = makeHeader({ slot: -1 });
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("slot"))).toBe(true);
    });

    it("rejects header with invalid parentRoot", () => {
      const header = makeHeader({ parentRoot: "0x1234" });
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(false);
    });

    it("rejects header with invalid signature", () => {
      const header = makeHeader({ signature: "bad" });
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(false);
    });

    it("rejects header with invalid proposerIndex", () => {
      const header = makeHeader({ proposerIndex: -5 });
      const result = verifier.validateHeader(header);
      expect(result.isValid).toBe(false);
    });
  });

  describe("validateHeaderChain", () => {
    it("validates a chain of consecutive headers", () => {
      const headers = [
        makeHeader({ slot: 100, bodyRoot: "0x" + "aa".repeat(32) }),
        makeHeader({ slot: 101, parentRoot: "0x" + "aa".repeat(32), bodyRoot: "0x" + "bb".repeat(32) }),
        makeHeader({ slot: 102, parentRoot: "0x" + "bb".repeat(32), bodyRoot: "0x" + "cc".repeat(32) }),
      ];
      const results = verifier.validateHeaderChain(headers);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.isValid)).toBe(true);
    });

    it("detects parentRoot mismatch in chain", () => {
      const headers = [
        makeHeader({ slot: 100, bodyRoot: "0x" + "aa".repeat(32) }),
        makeHeader({ slot: 101, parentRoot: "0x" + "dd".repeat(32) }),
      ];
      const results = verifier.validateHeaderChain(headers);
      expect(results[1].isValid).toBe(false);
      expect(results[1].errors.some((e) => e.includes("parentRoot mismatch"))).toBe(true);
    });

    it("detects slot gap in chain", () => {
      const headers = [
        makeHeader({ slot: 100 }),
        makeHeader({ slot: 200 }),
      ];
      const results = verifier.validateHeaderChain(headers);
      expect(results[1].isValid).toBe(false);
      expect(results[1].errors.some((e) => e.includes("Slot gap"))).toBe(true);
    });
  });

  describe("verifyStateTransition", () => {
    it("returns true for valid state transition", () => {
      const parent = makeHeader({ slot: 100, stateRoot: "0x" + "aa".repeat(32) });
      const child = makeHeader({ slot: 101, stateRoot: "0x" + "bb".repeat(32) });
      expect(verifier.verifyStateTransition(parent, child)).toBe(true);
    });

    it("returns false when state root unchanged", () => {
      const parent = makeHeader({ slot: 100, stateRoot: "0x" + "aa".repeat(32) });
      const child = makeHeader({ slot: 101, stateRoot: "0x" + "aa".repeat(32) });
      expect(verifier.verifyStateTransition(parent, child)).toBe(false);
    });

    it("returns false when parent header is invalid", () => {
      const parent = makeHeader({ slot: -1, stateRoot: "0x" + "aa".repeat(32) });
      const child = makeHeader({ slot: 101, stateRoot: "0x" + "bb".repeat(32) });
      expect(verifier.verifyStateTransition(parent, child)).toBe(false);
    });
  });

  describe("generateStateProof", () => {
    it("generates a valid state proof for a good header with quorum", () => {
      const header = makeHeader();
      const committee = makeCommittee();
      const proof = verifier.generateStateProof(header, committee);
      expect(proof.isValid).toBe(true);
      expect(proof.stateRoot).toBe(header.stateRoot);
      expect(proof.slot).toBe(header.slot);
      expect(proof.quorumVotes).toBeGreaterThan(0);
      expect(proof.verifiedAt).toBeGreaterThan(0);
    });

    it("generates invalid proof when quorum not met", () => {
      const header = makeHeader();
      const committee = makeCommittee({ participantsBits: "0".repeat(512) });
      const proof = verifier.generateStateProof(header, committee);
      expect(proof.isValid).toBe(false);
    });
  });
});

describe("SyncCommitteeVerifier", () => {
  let syncVerifier: SyncCommitteeVerifier;

  beforeEach(() => {
    syncVerifier = new SyncCommitteeVerifier();
  });

  describe("verifySignature", () => {
    it("returns true for a valid BLS signature with correct committee", () => {
      const header = makeHeader({ slot: 100 });
      const committee = makeCommittee();
      const blsSig = makeBLSSignature(header, committee);
      expect(syncVerifier.verifySignature(header, blsSig)).toBe(true);
    });

    it("returns false for empty signature", () => {
      const header = makeHeader({ slot: 100 });
      const committee = makeCommittee();
      const blsSig = makeBLSSignature(header, committee, { signature: "0x" });
      expect(syncVerifier.verifySignature(header, blsSig)).toBe(false);
    });

    it("returns false for signature without 0x prefix", () => {
      const header = makeHeader({ slot: 100 });
      const committee = makeCommittee();
      const blsSig = makeBLSSignature(header, committee, { signature: "deadbeef" });
      expect(syncVerifier.verifySignature(header, blsSig)).toBe(false);
    });

    it("returns false when slot mismatch", () => {
      const header = makeHeader({ slot: 100 });
      const committee = makeCommittee();
      const blsSig = makeBLSSignature(header, committee, { slot: 999 });
      expect(syncVerifier.verifySignature(header, blsSig)).toBe(false);
    });

    it("returns false when committee size mismatches expected", () => {
      const header = makeHeader({ slot: 100 });
      const committee = makeCommittee({ pubkeys: Array(100).fill("0x" + "ee".repeat(48)) });
      const blsSig = makeBLSSignature(header, committee);
      expect(syncVerifier.verifySignature(header, blsSig)).toBe(false);
    });
  });

  describe("verifyQuorum", () => {
    it("passes when participation meets 2/3 threshold", () => {
      const committee = makeCommittee({ participantsBits: "1".repeat(342) + "0".repeat(170) });
      const blsSig = makeBLSSignature(makeHeader(), committee);
      expect(syncVerifier.verifyQuorum(blsSig)).toBe(true);
    });

    it("fails when participation is below 2/3 threshold", () => {
      const committee = makeCommittee({ participantsBits: "1".repeat(100) + "0".repeat(412) });
      const blsSig = makeBLSSignature(makeHeader(), committee);
      expect(syncVerifier.verifyQuorum(blsSig)).toBe(false);
    });

    it("fails for empty committee", () => {
      const committee = makeCommittee({ pubkeys: [], participantsBits: "" });
      const blsSig = makeBLSSignature(makeHeader(), committee);
      expect(syncVerifier.verifyQuorum(blsSig)).toBe(false);
    });
  });

  describe("countParticipants", () => {
    it("counts bits correctly", () => {
      const result = syncVerifier.countParticipants("1011");
      expect(result).toBe(3);
    });

    it("returns 0 for empty bitstring", () => {
      expect(syncVerifier.countParticipants("")).toBe(0);
    });
  });

  describe("verifyCommitteePeriod", () => {
    it("returns true when period matches slot", () => {
      const committee = makeCommittee({ period: 0 });
      const blsSig = makeBLSSignature(makeHeader({ slot: 100 }), committee);
      expect(syncVerifier.verifyCommitteePeriod(blsSig)).toBe(true);
    });

    it("returns false when period does not match slot", () => {
      const committee = makeCommittee({ period: 5 });
      const blsSig = makeBLSSignature(makeHeader({ slot: 100 }), committee);
      expect(syncVerifier.verifyCommitteePeriod(blsSig)).toBe(false);
    });
  });
});
