import { HistoryCommand } from '../history.command';
import { LiquidityCommand } from '../liquidity.command';
import { CongestionCommand } from '../congestion.command';
import { CompareCommand } from '../compare.command';
import { StatusCommand } from '../status.command';
import { CommandRunner } from '../command-runner';
import { HelpCommand } from '../help.command';
import { StatusChecker } from '../../../../../libs/sdk/src/status-checker';

declare const process: { exit(code?: number): void };

async function runAllTests() {
  console.log('Running BridgeWise CLI Unit Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ ${testName}`);
      failed++;
    }
  }

  // 1. HistoryCommand Tests
  {
    console.log('[HistoryCommand]');
    const history = new HistoryCommand();
    const res1 = await history.execute([], {});
    assert(res1.success === false, 'Returns error when account is missing');

    const res2 = await history.execute([], { account: 'GBX123' });
    assert(res2.success === true && res2.data!.length > 0, 'Fetches transactions for valid account');

    const res3 = await history.execute([], { account: 'GBX123', status: 'confirmed' });
    assert(res3.data!.every((tx) => tx.status === 'confirmed'), 'Filters transactions by status');

    const res4 = await history.execute([], { account: 'GBX123', limit: 1 });
    assert(res4.data!.length === 1, 'Respects limit option');
  }

  // 2. LiquidityCommand Tests
  {
    console.log('\n[LiquidityCommand]');
    const liquidity = new LiquidityCommand();
    const res1 = await liquidity.execute([], { token: 'USDC', sourceChain: 'Ethereum', destinationChain: 'Stellar', amount: 1000 });
    assert(res1.success === true && res1.data!.status === 'optimal', 'Returns optimal liquidity for valid amount');

    const res2 = await liquidity.execute([], { token: 'USDC', sourceChain: 'Ethereum', destinationChain: 'Stellar', amount: 200000 });
    assert(res2.success === true && res2.data!.status === 'low_liquidity_warning', 'Returns warning when amount exceeds single-tx limit');

    const res3 = await liquidity.execute([], { token: 'USDC', sourceChain: 'Ethereum', destinationChain: 'Stellar', amount: 9999999 });
    assert(res3.success === false && res3.data!.status === 'insufficient_liquidity', 'Returns failure when amount exceeds liquidity');
  }

  // 3. CongestionCommand Tests
  {
    console.log('\n[CongestionCommand]');
    const congestion = new CongestionCommand();
    const res1 = await congestion.execute([], { route: 'stellar-bridge-1', latencyMs: 1200, failureRate: 0.02 });
    assert(res1.success === true && res1.data!.status === 'normal', 'Returns normal status for healthy metrics');

    const res2 = await congestion.execute([], { route: 'stellar-bridge-1', latencyMs: 6000, failureRate: 0.35 });
    assert(res2.success === true && res2.data!.status === 'severe', 'Reports severe status for high latency and failure rate');
  }

  // 4. CompareCommand Tests
  {
    console.log('\n[CompareCommand]');
    const compare = new CompareCommand();
    const res = await compare.execute([], { sourceChain: 'Ethereum', destinationChain: 'Stellar', token: 'USDC', amount: 500 });
    assert(res.success === true && res.data![0].recommended === true, 'Compares routes and ranks recommended route first');
  }

  // 5. StatusCommand & StatusChecker Tests
  {
    console.log('\n[StatusCommand & StatusChecker]');
    const status = new StatusCommand();
    const validHash = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F1234567890abcdef12345678';
    
    const res1 = await status.execute([validHash], {});
    assert(res1.success === true && res1.data!.txHash === validHash && res1.data!.milestones.length === 3, 'Returns real-time cross-chain lifecycle status for valid hash');

    const res2 = await status.execute([validHash], { 'source-chain': 'Stellar' });
    assert(res2.success === true && res2.data!.sourceChain === 'Stellar', 'Respects --source-chain flag');

    const res3 = await status.execute(['invalid_hash_value'], {});
    assert(res3.success === false && res3.error!.includes('Invalid transaction hash'), 'Handles invalid hash gracefully');

    const res4 = await status.execute([validHash], { 'source-chain': 'UnsupportedChain' });
    assert(res4.success === false && res4.error!.includes('Unsupported source chain'), 'Handles unsupported chain gracefully');

    const checker = new StatusChecker();
    assert(StatusChecker.isValidTxHash(validHash) === true, 'StatusChecker validates hex tx hash');
    assert(StatusChecker.isValidTxHash('invalid') === false, 'StatusChecker rejects invalid tx hash');
    assert(StatusChecker.normalizeChain('stellar') === 'Stellar', 'StatusChecker normalizes chain name');
    assert(StatusChecker.normalizeChain('invalid') === null, 'StatusChecker returns null for invalid chain');

    const checkRes = await checker.checkStatus(validHash, { sourceChain: 'Polygon' });
    assert(checkRes.sourceChain === 'Polygon' && checkRes.status === 'Relayed', 'StatusChecker queries full lifecycle status');
  }

  // 6. CommandRunner Tests
  {
    console.log('\n[CommandRunner]');
    const runner = new CommandRunner(
      new HistoryCommand(),
      new LiquidityCommand(),
      new CongestionCommand(),
      new CompareCommand(),
      new StatusCommand(),
      new HelpCommand(),
    );
    runner.onModuleInit();

    const parsed = runner.parseArgv(['node', 'bridgewise', 'history', '--account', 'G12345', '--format', 'json']);
    assert(parsed.commandName === 'history' && parsed.options.account === 'G12345' && parsed.format === 'json', 'Parses CLI arguments correctly');

    const jsonOutput = await runner.run(['node', 'bridgewise', 'history', '--account', 'G12345', '--format', 'json']);
    const parsedJson = JSON.parse(jsonOutput);
    assert(parsedJson.success === true && parsedJson.command === 'history', 'Executes command and formats JSON');
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test Runner Error:', err);
  process.exit(1);
});
