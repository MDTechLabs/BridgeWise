import { ReplayDetector } from "./replay-detector";
import { AstContractNode, AstFunctionNode } from "./types";

function makeSecureFunction(name: string): AstFunctionNode {
  return {
    name,
    body: `
      function ${name}() external nonReentrant {
        require(msg.sender == bridgeAddress, "unauthorized");
        require(!processedMessages[msgHash], "already processed");
        processedMessages[msgHash] = true;
      }
    `,
    modifiers: ["nonReentrant"],
    calls: [],
  };
}

function makeInsecureFunction(name: string): AstFunctionNode {
  return {
    name,
    body: `
      function ${name}(bytes calldata data) external {
        // process the message without any guards
        executeMessage(data);
      }
    `,
    modifiers: [],
    calls: ["executeMessage(data)"],
  };
}

function makeContract(funcs: AstFunctionNode[]): AstContractNode {
  return { name: "TestBridge", kind: "solidity", functions: funcs };
}

describe("ReplayDetector", () => {
  const detector = new ReplayDetector();

  describe("detectReplayVulnerability", () => {
    it("returns no issues for a fully protected contract", () => {
      const contract = makeContract([
        makeSecureFunction("execute"),
      ]);
      const issues = detector.detectReplayVulnerability(contract);
      expect(issues.length).toBe(0);
    });

    it("flags a function missing all replay protection", () => {
      const contract = makeContract([
        makeInsecureFunction("execute"),
      ]);
      const issues = detector.detectReplayVulnerability(contract);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.issue === "missing_replay_protection")).toBe(true);
    });

    it("flags a function missing origin check", () => {
      const contract = makeContract([
        {
          name: "execute",
          body: "processedMessages[hash] = true;",
          modifiers: ["nonReentrant"],
          calls: [],
        },
      ]);
      const issues = detector.detectReplayVulnerability(contract);
      expect(issues.some((i) => i.issue === "missing_origin_check")).toBe(true);
    });

    it("returns one issue per vulnerable function", () => {
      const contract = makeContract([
        makeInsecureFunction("execute1"),
        makeInsecureFunction("execute2"),
      ]);
      const issues = detector.detectReplayVulnerability(contract);
      expect(issues.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array for empty contract", () => {
      const contract = makeContract([]);
      const issues = detector.detectReplayVulnerability(contract);
      expect(issues).toEqual([]);
    });
  });
});
