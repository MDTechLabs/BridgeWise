import {
  validateChainConfig,
  validateChainConfigMap,
  assertValidChainConfigMap,
} from "../src/chain-schema";

const valid = {
  name: "Ethereum Mainnet",
  chainId: 1,
  rpcUrl: "https://mainnet.example.com/rpc",
  bridgeRegistryAddress: "0x" + "a".repeat(40),
  confirmationDepth: 12,
};

describe("validateChainConfig", () => {
  it("accepts a fully valid config", () => {
    const result = validateChainConfig(valid);
    expect(result.success).toBe(true);
    expect(result.data?.chainId).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an invalid RPC URL", () => {
    const result = validateChainConfig({ ...valid, rpcUrl: "not-a-url" });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "rpcUrl")).toBe(true);
  });

  it("rejects a missing bridge registry address", () => {
    const { bridgeRegistryAddress: _omit, ...withoutAddress } = valid;
    const result = validateChainConfig(withoutAddress);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "bridgeRegistryAddress")).toBe(true);
  });

  it("rejects a malformed bridge registry address", () => {
    const result = validateChainConfig({ ...valid, bridgeRegistryAddress: "0x123" });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "bridgeRegistryAddress")).toBe(true);
  });

  it("rejects non-positive and non-integer chain IDs", () => {
    expect(validateChainConfig({ ...valid, chainId: 0 }).success).toBe(false);
    expect(validateChainConfig({ ...valid, chainId: -1 }).success).toBe(false);
    expect(validateChainConfig({ ...valid, chainId: 1.5 }).success).toBe(false);
  });

  it("rejects a negative confirmation depth", () => {
    const result = validateChainConfig({ ...valid, confirmationDepth: -3 });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "confirmationDepth")).toBe(true);
  });

  it("rejects unknown extra fields (strict schema)", () => {
    const result = validateChainConfig({ ...valid, rcpUrl: "typo" });
    expect(result.success).toBe(false);
  });
});

describe("validateChainConfigMap / assertValidChainConfigMap", () => {
  it("accepts a map of valid configs", () => {
    const result = validateChainConfigMap({ ethereum: valid });
    expect(result.success).toBe(true);
    expect(result.data?.ethereum.name).toBe("Ethereum Mainnet");
  });

  it("aggregates errors across chains with chain-prefixed paths", () => {
    const result = validateChainConfigMap({
      ethereum: valid,
      broken: { ...valid, rpcUrl: "bad" },
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith("broken."))).toBe(true);
  });

  it("throws a descriptive error at startup for an invalid map", () => {
    expect(() =>
      assertValidChainConfigMap({ broken: { ...valid, chainId: -1 } })
    ).toThrow(/Invalid chain configuration/);
  });

  it("returns typed data for a valid map", () => {
    const data = assertValidChainConfigMap({ ethereum: valid });
    expect(data.ethereum.confirmationDepth).toBe(12);
  });
});
