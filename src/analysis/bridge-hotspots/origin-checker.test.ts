import { OriginChecker } from "./origin-checker";
import { AstContractNode, AstFunctionNode } from "./types";

function makeCallFunction(name: string, body: string): AstFunctionNode {
  return { name, body, modifiers: [], calls: [] };
}

function makeContract(funcs: AstFunctionNode[]): AstContractNode {
  return { name: "TestBridge", kind: "solidity", functions: funcs };
}

describe("OriginChecker", () => {
  const checker = new OriginChecker();

  describe("checkArbitraryExecution", () => {
    it("returns no issues for a function without external calls", () => {
      const contract = makeContract([
        makeCallFunction("safeOp", "uint256 x = 1 + 2;"),
      ]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues).toEqual([]);
    });

    it("flags arbitrary .call() without allowlist", () => {
      const contract = makeContract([
        makeCallFunction(
          "execute",
          '(bool success, bytes memory data) = target.call(payload);',
        ),
      ]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.issue === "arbitrary_call_execution")).toBe(true);
    });

    it("flags .delegatecall() without allowlist", () => {
      const contract = makeContract([
        makeCallFunction(
          "proxy",
          '(bool ok,) = address(delegate).delegatecall(data);',
        ),
      ]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("passes if allowlist check is present", () => {
      const contract = makeContract([
        makeCallFunction(
          "safeExecute",
          `
            require(allowedTargets[target], "unauthorized");
            (bool success,) = target.call(payload);
            require(success, "call failed");
          `,
        ),
      ]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues.filter((i) => i.issue === "arbitrary_call_execution")).toEqual([]);
    });

    it("flags missing success check after call", () => {
      const contract = makeContract([
        makeCallFunction(
          "unsafeCall",
          `
            require(allowedTargets[target], "unauthorized");
            target.call(payload);
          `,
        ),
      ]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues.some((i) => i.description.includes("return value"))).toBe(true);
    });

    it("returns empty for empty contract", () => {
      const contract = makeContract([]);
      const issues = checker.checkArbitraryExecution(contract);
      expect(issues).toEqual([]);
    });
  });
});
