import { BridgeSecurityAnalyzer, bridgeSecurityAnalyzer } from "./analyzer";
import { AstContractNode, AstFunctionNode } from "./types";

function makeFunction(name: string, body: string): AstFunctionNode {
  return { name, body, modifiers: [], calls: [] };
}

function makeContract(name: string, funcs: AstFunctionNode[]): AstContractNode {
  return { name, kind: "solidity", functions: funcs };
}

describe("BridgeSecurityAnalyzer", () => {
  const analyzer = new BridgeSecurityAnalyzer();

  describe("analyzeContract", () => {
    it("returns clean report for a secure contract", () => {
      const contract = makeContract("SecureBridge", [
        {
          name: "execute",
          body: `
            require(msg.sender == bridge, "unauthorized");
            require(!processedMessages[hash], "replay");
            processedMessages[hash] = true;
            require(allowedTargets[target], "unauthorized");
            (bool success,) = target.call(payload);
            require(success, "call failed");
          `,
          modifiers: ["nonReentrant"],
          calls: [],
        },
      ]);
      const report = analyzer.analyzeContract(contract);
      expect(report.issueCount).toBe(0);
      expect(report.summary).toBe("No security issues detected.");
    });

    it("detects issues in an insecure contract", () => {
      const contract = makeContract("InsecureBridge", [
        makeFunction(
          "execute",
          '(bool ok,) = target.call(data);',
        ),
      ]);
      const report = analyzer.analyzeContract(contract);
      expect(report.issueCount).toBeGreaterThan(0);
      expect(report.issues.some((i) => i.severity === "critical")).toBe(true);
    });

    it("reports correct totalChecks count", () => {
      const contract = makeContract("Test", [
        makeFunction(
          "fn1",
          '(bool s,) = addr.call("");',
        ),
        makeFunction("fn2", ""),
      ]);
      const report = analyzer.analyzeContract(contract);
      expect(report.totalChecks).toBeGreaterThanOrEqual(1);
    });

    it("includes scan timestamp", () => {
      const contract = makeContract("T", [makeFunction("f", "")]);
      const report = analyzer.analyzeContract(contract);
      expect(typeof report.scanTimestamp).toBe("number");
      expect(report.scanTimestamp).toBeGreaterThan(0);
    });
  });

  describe("analyzeAll", () => {
    it("returns summary across multiple contracts", () => {
      const contracts = [
        makeContract("Secure", []),
        makeContract("Insecure", [
          makeFunction(
            "execute",
            'addr.call("");',
          ),
        ]),
      ];
      const report = analyzer.analyzeAll(contracts);
      expect(report.issueCount).toBeGreaterThan(0);
    });
  });

  describe("singleton instance", () => {
    it("exports a default singleton", () => {
      expect(bridgeSecurityAnalyzer).toBeInstanceOf(BridgeSecurityAnalyzer);
    });
  });
});
