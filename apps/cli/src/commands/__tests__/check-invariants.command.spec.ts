import { CheckInvariantsCommand } from '../check-invariants.command';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CheckInvariantsCommand', () => {
  let command: CheckInvariantsCommand;
  let tempDir: string;

  beforeEach(() => {
    command = new CheckInvariantsCommand();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridgewise-invariants-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function writeSolFile(fileName: string, content: string): string {
    const filePath = path.join(tempDir, fileName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('should return error if path option is missing', async () => {
    const result = await command.execute([], {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Contract path is required');
  });

  it('should return error if path does not exist', async () => {
    const result = await command.execute([], { path: '/nonexistent/path' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path does not exist');
  });

  it('should return error if no .sol files found', async () => {
    // Create empty temp dir
    const result = await command.execute([], { path: tempDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No Solidity (.sol) files found');
  });

  it('should analyze a valid Solidity contract file', async () => {
    const solContent = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestBridge {
    uint256 public lockedReserves;
    uint256 public mintedSupply;

    function bridgeIn(address to, uint256 amount) external {
        lockedReserves += amount;
        mintedSupply += amount;
    }
}
`;
    writeSolFile('TestBridge.sol', solContent);

    const result = await command.execute([], {
      path: tempDir,
      'fail-on-violations': false,
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.contractsAnalyzed).toBe(1);
    expect(result.data!.functionsAnalyzed).toBeGreaterThan(0);
  });

  it('should detect invariant violations in a vulnerable contract', async () => {
    const solContent = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VulnerableBridge {
    uint256 public totalMinted;

    // VULNERABILITY: public mint with no access control and no lock
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
        totalMinted += amount;
    }

    function _mint(address to, uint256 amount) internal {
        // simplified
    }
}
`;
    writeSolFile('VulnerableBridge.sol', solContent);

    const result = await command.execute([], { path: tempDir });
    expect(result.success).toBe(false); // fail-on-violations defaults to true
    expect(result.data).toBeDefined();
    expect(result.data!.violations.length).toBeGreaterThan(0);
  });

  it('should analyze .sol files recursively in subdirectories', async () => {
    const subDir = path.join(tempDir, 'tokens');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'Token.sol'),
      `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Token {
    function foo() external pure returns (uint256) { return 42; }
}
`,
      'utf-8',
    );

    const result = await command.execute([], {
      path: tempDir,
      'fail-on-violations': false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.contractsAnalyzed).toBe(1);
  });

  it('should support the --severity filter option', async () => {
    const solContent = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestContract {
    uint256 public totalMinted;

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
        totalMinted += amount;
    }

    function _mint(address to, uint256 amount) internal {}
}
`;
    writeSolFile('TestContract.sol', solContent);

    // With severity=critical, the access-control violation should still appear
    const resultCritical = await command.execute([], {
      path: tempDir,
      severity: 'critical',
    });

    expect(resultCritical.data).toBeDefined();
    const criticalViolations = resultCritical.data!.violations.filter(
      (v) => v.severity === 'critical',
    );
    // All returned violations should be critical
    expect(
      resultCritical.data!.violations.every((v) => v.severity === 'critical'),
    ).toBe(true);
  });

  it('should accept path as first positional argument', async () => {
    const solContent = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Simple { function foo() external pure returns (uint256) { return 1; } }
`;
    writeSolFile('Simple.sol', solContent);

    const result = await command.execute([tempDir], {
      'fail-on-violations': false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.contractsAnalyzed).toBe(1);
  });

  it('should handle files with no valid contracts gracefully', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'Empty.sol'),
      '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n// No contract here\n',
      'utf-8',
    );

    const result = await command.execute([], { path: tempDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid Solidity contracts found');
  });
});
