import { CommandRunner } from '../command-runner';
import { HistoryCommand } from '../history.command';
import { LiquidityCommand } from '../liquidity.command';
import { CongestionCommand } from '../congestion.command';
import { CompareCommand } from '../compare.command';
import { StatusCommand } from '../status.command';
import { HelpCommand } from '../help.command';

describe('CommandRunner', () => {
  let runner: CommandRunner;

  beforeEach(() => {
    const historyCommand = new HistoryCommand();
    const liquidityCommand = new LiquidityCommand();
    const congestionCommand = new CongestionCommand();
    const compareCommand = new CompareCommand();
    const statusCommand = new StatusCommand();
    const helpCommand = new HelpCommand();

    runner = new CommandRunner(
      historyCommand,
      liquidityCommand,
      congestionCommand,
      compareCommand,
      statusCommand,
      helpCommand,
    );
    runner.onModuleInit();
  });

  it('should parse command line flags correctly', () => {
    const parsed = runner.parseArgv([
      'node',
      'bridgewise',
      'history',
      '--account',
      'G12345',
      '--status',
      'confirmed',
      '--format',
      'json',
    ]);

    expect(parsed.commandName).toBe('history');
    expect(parsed.options.account).toBe('G12345');
    expect(parsed.options.status).toBe('confirmed');
    expect(parsed.format).toBe('json');
  });

  it('should run history command and format output as JSON', async () => {
    const output = await runner.run([
      'node',
      'bridgewise',
      'history',
      '--account',
      'GBX345EXAMPLESTELLARACCOUNTADDRESSFORTESIS12345',
      '--format',
      'json',
    ]);

    const json = JSON.parse(output);
    expect(json.success).toBe(true);
    expect(json.command).toBe('history');
  });

  it('should run liquidity command and format text output', async () => {
    const output = await runner.run([
      'node',
      'bridgewise',
      'liquidity',
      '--token',
      'USDC',
      '--sourceChain',
      'Ethereum',
      '--destinationChain',
      'Stellar',
    ]);

    expect(output).toContain('[SUCCESS] (liquidity)');
    expect(output).toContain('USDC');
  });

  it('should run help command when no command is specified', async () => {
    const output = await runner.run(['node', 'bridgewise', 'help']);
    expect(output).toContain('Available Commands:');
  });
});
