import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SandboxScenario,
  SandboxTransactionState,
  PartnerSandboxConfig,
  SandboxTransaction,
  SandboxQuote,
  GetSandboxQuoteDto,
  CreateSandboxTxDto,
  SetScenarioDto,
  FaucetRequestDto,
  TestWebhookDto,
  SandboxStatusResponse,
} from './sandbox.types';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  // In-memory partner configurations
  private readonly partnerConfigs = new Map<string, PartnerSandboxConfig>();

  // In-memory simulated transactions
  private readonly transactions = new Map<string, SandboxTransaction>();

  // In-memory test faucet balances: partnerId:address:token -> balance
  private readonly faucetBalances = new Map<string, number>();

  // Metrics tracking
  private totalSandboxQuotes = 0;
  private totalSandboxTransactions = 0;
  private scenarioCounts: Record<string, number> = {};

  private readonly SUPPORTED_CHAINS = [
    { id: 1001, name: 'Stellar Mainnet (Simulated)', type: 'stellar' as const },
    { id: 1002, name: 'Stellar Testnet', type: 'stellar' as const },
    { id: 1, name: 'Ethereum Mainnet (Simulated)', type: 'evm' as const },
    { id: 137, name: 'Polygon (Simulated)', type: 'evm' as const },
    { id: 42161, name: 'Arbitrum One (Simulated)', type: 'evm' as const },
    { id: 10, name: 'Optimism (Simulated)', type: 'evm' as const },
  ];

  private readonly SUPPORTED_TOKENS = ['USDC', 'XLM', 'ETH', 'yXLM', 'USDT', 'WBTC'];

  /**
   * Get or initialize configuration for a given partner
   */
  getPartnerConfig(partnerId = 'default'): PartnerSandboxConfig {
    if (!this.partnerConfigs.has(partnerId)) {
      const now = new Date();
      this.partnerConfigs.set(partnerId, {
        partnerId,
        activeScenario: SandboxScenario.SUCCESS,
        simulatedLatencyMs: 50,
        failureRate: 0.0,
        createdAt: now,
        updatedAt: now,
      });
    }
    return this.partnerConfigs.get(partnerId)!;
  }

  /**
   * Set simulation scenario and behavioral options for partner
   */
  setPartnerScenario(partnerId: string, dto: SetScenarioDto): PartnerSandboxConfig {
    const config = this.getPartnerConfig(partnerId);

    if (!Object.values(SandboxScenario).includes(dto.scenario)) {
      throw new BadRequestException(
        `Invalid scenario "${dto.scenario}". Valid options: ${Object.values(
          SandboxScenario,
        ).join(', ')}`,
      );
    }

    config.activeScenario = dto.scenario;
    if (dto.simulatedLatencyMs !== undefined) {
      if (dto.simulatedLatencyMs < 0 || dto.simulatedLatencyMs > 30000) {
        throw new BadRequestException('simulatedLatencyMs must be between 0 and 30000 ms');
      }
      config.simulatedLatencyMs = dto.simulatedLatencyMs;
    }

    if (dto.failureRate !== undefined) {
      if (dto.failureRate < 0 || dto.failureRate > 1.0) {
        throw new BadRequestException('failureRate must be between 0.0 and 1.0');
      }
      config.failureRate = dto.failureRate;
    }

    if (dto.webhookUrl !== undefined) {
      config.webhookUrl = dto.webhookUrl;
    }

    config.updatedAt = new Date();
    this.partnerConfigs.set(partnerId, config);

    this.logger.log(
      `Partner [${partnerId}] updated sandbox scenario to: ${config.activeScenario} (latency: ${config.simulatedLatencyMs}ms)`,
    );

    return config;
  }

  /**
   * Reset partner sandbox state, removing all mock transactions and resetting balances
   */
  resetPartner(partnerId = 'default'): { success: boolean; message: string; resetCount: number } {
    let deletedCount = 0;
    for (const [id, tx] of this.transactions.entries()) {
      if (tx.partnerId === partnerId) {
        this.transactions.delete(id);
        deletedCount++;
      }
    }

    // Reset faucet balances for this partner
    const prefix = `${partnerId}:`;
    for (const key of this.faucetBalances.keys()) {
      if (key.startsWith(prefix)) {
        this.faucetBalances.delete(key);
      }
    }

    // Reset configuration to default success
    const now = new Date();
    this.partnerConfigs.set(partnerId, {
      partnerId,
      activeScenario: SandboxScenario.SUCCESS,
      simulatedLatencyMs: 50,
      failureRate: 0.0,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.log(`Partner [${partnerId}] sandbox state reset. Deleted ${deletedCount} transactions.`);

    return {
      success: true,
      message: `Partner [${partnerId}] sandbox state successfully reset.`,
      resetCount: deletedCount,
    };
  }

  /**
   * Generate simulated quote based on active scenario
   */
  async getQuote(dto: GetSandboxQuoteDto, partnerId = 'default'): Promise<SandboxQuote> {
    const config = this.getPartnerConfig(partnerId);
    const scenario = dto.scenario || config.activeScenario;

    this.totalSandboxQuotes++;
    this.scenarioCounts[scenario] = (this.scenarioCounts[scenario] || 0) + 1;

    // Simulate network latency if configured
    if (config.simulatedLatencyMs > 0) {
      await new Promise((res) => setTimeout(res, config.simulatedLatencyMs));
    }

    // Check scenario behaviors
    if (scenario === SandboxScenario.TIMEOUT) {
      this.logger.warn(`Sandbox scenario [TIMEOUT] triggered for partner [${partnerId}]`);
      throw new GatewayTimeoutException('Simulated upstream bridge provider request timed out (504)');
    }

    if (scenario === SandboxScenario.ROUTE_UNAVAILABLE) {
      return {
        id: `sb_quote_${randomUUID().slice(0, 8)}`,
        provider: 'BridgeWiseSandbox',
        fromChain: dto.fromChain,
        toChain: dto.toChain,
        fromToken: dto.fromToken,
        toToken: dto.toToken || dto.fromToken,
        inputAmount: dto.amount,
        outputAmount: '0',
        feeAmount: '0',
        feeToken: dto.fromToken,
        netOutputAmount: '0',
        estimatedTimeSeconds: 0,
        isSandbox: true,
        scenario,
        routeSupported: false,
        error: `Simulated bridge route unavailable between chain ${dto.fromChain} and ${dto.toChain}`,
      };
    }

    if (scenario === SandboxScenario.INSUFFICIENT_LIQUIDITY) {
      return {
        id: `sb_quote_${randomUUID().slice(0, 8)}`,
        provider: 'BridgeWiseSandbox',
        fromChain: dto.fromChain,
        toChain: dto.toChain,
        fromToken: dto.fromToken,
        toToken: dto.toToken || dto.fromToken,
        inputAmount: dto.amount,
        outputAmount: '0',
        feeAmount: '0',
        feeToken: dto.fromToken,
        netOutputAmount: '0',
        estimatedTimeSeconds: 0,
        isSandbox: true,
        scenario,
        routeSupported: true,
        error: 'Insufficient simulated liquidity in bridge destination pool for requested volume',
      };
    }

    const inputNum = parseFloat(dto.amount);
    if (isNaN(inputNum) || inputNum <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const feeRate = 0.001; // 0.1% simulated fee
    const fee = Math.max(0.1, inputNum * feeRate);
    const output = Math.max(0, inputNum - fee);

    return {
      id: `sb_quote_${randomUUID().slice(0, 8)}`,
      provider: 'BridgeWiseSandbox',
      fromChain: dto.fromChain,
      toChain: dto.toChain,
      fromToken: dto.fromToken,
      toToken: dto.toToken || dto.fromToken,
      inputAmount: dto.amount,
      outputAmount: output.toFixed(6),
      feeAmount: fee.toFixed(6),
      feeToken: dto.fromToken,
      netOutputAmount: output.toFixed(6),
      estimatedTimeSeconds: scenario === SandboxScenario.DELAYED_COMPLETION ? 120 : 10,
      isSandbox: true,
      scenario,
      routeSupported: true,
    };
  }

  /**
   * Create a simulated sandbox bridge transaction with full lifecycle steps
   */
  async createTransaction(dto: CreateSandboxTxDto, partnerId = 'default'): Promise<SandboxTransaction> {
    const config = this.getPartnerConfig(partnerId);
    const scenario = dto.scenario || config.activeScenario;

    const amountNum = parseFloat(dto.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Amount must be a positive valid number');
    }

    if (!dto.senderAddress || !dto.recipientAddress) {
      throw new BadRequestException('Both senderAddress and recipientAddress are required');
    }

    if (scenario === SandboxScenario.SLIPPAGE_EXCEEDED) {
      throw new BadRequestException('Execution reverted: Simulated slippage limit exceeded (slippage > 0.5%)');
    }

    const txId = `sb_tx_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const fee = Math.max(0.05, amountNum * 0.001);
    const estimatedOutput = Math.max(0, amountNum - fee).toFixed(6);

    let finalState: SandboxTransactionState;
    let failureReason: string | undefined;

    const steps: SandboxTransaction['steps'] = [
      {
        name: 'Transaction Initialized',
        status: 'success',
        timestamp: now,
        details: `Simulated bridge initiated from ${dto.fromChain} to ${dto.toChain}`,
      },
    ];

    if (scenario === SandboxScenario.DESTINATION_REVERT) {
      finalState = SandboxTransactionState.REFUNDED;
      failureReason = 'Destination bridge execution reverted: Insufficient gas or target contract reverted. Funds refunded to sender.';
      steps.push({
        name: 'Source Chain Confirmed',
        status: 'success',
        timestamp: new Date().toISOString(),
        details: `Deposit confirmed on source chain ${dto.fromChain}`,
      });
      steps.push({
        name: 'Destination Minting',
        status: 'failed',
        timestamp: new Date().toISOString(),
        details: failureReason,
      });
      steps.push({
        name: 'Source Refund Initiated',
        status: 'success',
        timestamp: new Date().toISOString(),
        details: `Simulated refund returned to ${dto.senderAddress}`,
      });
    } else if (scenario === SandboxScenario.DELAYED_COMPLETION) {
      finalState = SandboxTransactionState.DESTINATION_PROCESSING;
      steps.push({
        name: 'Source Chain Confirmed',
        status: 'success',
        timestamp: new Date().toISOString(),
        details: `Deposit confirmed on source chain ${dto.fromChain}`,
      });
      steps.push({
        name: 'Destination Minting',
        status: 'pending',
        timestamp: new Date().toISOString(),
        details: 'Simulated bridge batch verification in progress...',
      });
    } else {
      finalState = SandboxTransactionState.COMPLETED;
      steps.push({
        name: 'Source Chain Confirmed',
        status: 'success',
        timestamp: new Date().toISOString(),
        details: `Deposit confirmed on source chain ${dto.fromChain}`,
      });
      steps.push({
        name: 'Destination Minting',
        status: 'success',
        timestamp: new Date().toISOString(),
        details: `Tokens delivered to ${dto.recipientAddress} on chain ${dto.toChain}`,
      });
    }

    const tx: SandboxTransaction = {
      id: txId,
      partnerId,
      sourceChainId: dto.fromChain,
      destinationChainId: dto.toChain,
      sourceToken: dto.fromToken,
      destinationToken: dto.toToken || dto.fromToken,
      amount: dto.amount,
      estimatedOutput,
      netOutputAmount: estimatedOutput,
      feeAmount: fee.toFixed(6),
      feeToken: dto.fromToken,
      state: finalState,
      sourceTxHash: `0xsb_src_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
      destinationTxHash:
        finalState === SandboxTransactionState.COMPLETED
          ? `0xsb_dst_${randomUUID().replace(/-/g, '').slice(0, 32)}`
          : undefined,
      scenario,
      failureReason,
      steps,
      createdAt: now,
      updatedAt: now,
    };

    this.transactions.set(txId, tx);
    this.totalSandboxTransactions++;

    this.logger.log(
      `Created sandbox transaction [${txId}] for partner [${partnerId}] (scenario: ${scenario}, state: ${finalState})`,
    );

    return tx;
  }

  /**
   * Retrieve a sandbox transaction by ID
   */
  getTransaction(id: string, partnerId?: string): SandboxTransaction {
    const tx = this.transactions.get(id);
    if (!tx) {
      throw new NotFoundException(`Sandbox transaction ${id} not found`);
    }
    if (partnerId && tx.partnerId !== partnerId && tx.partnerId !== 'default') {
      throw new NotFoundException(`Sandbox transaction ${id} not found for this partner`);
    }
    return tx;
  }

  /**
   * List simulated transactions for a given partner
   */
  listTransactions(partnerId = 'default'): SandboxTransaction[] {
    const results: SandboxTransaction[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.partnerId === partnerId || partnerId === 'admin') {
        results.push(tx);
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Mint test tokens to a partner address
   */
  mintFaucetTokens(
    partnerId: string,
    dto: FaucetRequestDto,
  ): { address: string; token: string; amount: number; balance: number; txHash: string } {
    const token = (dto.token || 'USDC').toUpperCase();
    const amount = dto.amount !== undefined ? dto.amount : 1000;

    if (!dto.address || typeof dto.address !== 'string' || dto.address.trim().length === 0) {
      throw new BadRequestException('Valid recipient address is required');
    }

    if (amount <= 0 || amount > 100000) {
      throw new BadRequestException('Faucet amount must be between 1 and 100,000');
    }

    if (!this.SUPPORTED_TOKENS.includes(token)) {
      throw new BadRequestException(
        `Unsupported faucet token "${token}". Available tokens: ${this.SUPPORTED_TOKENS.join(', ')}`,
      );
    }

    const key = `${partnerId}:${dto.address}:${token}`;
    const current = this.faucetBalances.get(key) || 0;
    const newBalance = current + amount;
    this.faucetBalances.set(key, newBalance);

    const txHash = `0xsb_faucet_${randomUUID().replace(/-/g, '').slice(0, 32)}`;

    this.logger.log(`Faucet minted ${amount} ${token} to ${dto.address} (new balance: ${newBalance})`);

    return {
      address: dto.address,
      token,
      amount,
      balance: newBalance,
      txHash,
    };
  }

  /**
   * Get test faucet balance for a given address
   */
  getFaucetBalance(partnerId: string, address: string, token: string): number {
    const key = `${partnerId}:${address}:${token.toUpperCase()}`;
    return this.faucetBalances.get(key) || 0;
  }

  /**
   * Dispatch a simulated bridge webhook to partner's configured URL
   */
  async simulateWebhook(
    partnerId: string,
    dto: TestWebhookDto,
  ): Promise<{ sent: boolean; url: string; eventType: string; payload: any; simulated: boolean }> {
    const config = this.getPartnerConfig(partnerId);
    const targetUrl = dto.webhookUrl || config.webhookUrl;

    const eventType = dto.eventType || 'transaction.completed';
    const payload = dto.customPayload || {
      event: eventType,
      transactionId: `sb_tx_${randomUUID().slice(0, 8)}`,
      partnerId,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      details: {
        fromChain: 1001,
        toChain: 1,
        amount: '500.00',
        token: 'USDC',
      },
    };

    if (!targetUrl) {
      return {
        sent: false,
        url: 'none_configured',
        eventType,
        payload,
        simulated: true,
      };
    }

    this.logger.log(`Dispatching simulated webhook [${eventType}] to ${targetUrl}`);

    return {
      sent: true,
      url: targetUrl,
      eventType,
      payload,
      simulated: true,
    };
  }

  /**
   * Get overall sandbox environment status
   */
  getStatus(partnerId = 'default'): SandboxStatusResponse {
    const config = this.getPartnerConfig(partnerId);
    return {
      sandboxMode: true,
      version: '1.0.0',
      partnerId,
      activeScenario: config.activeScenario,
      supportedChains: this.SUPPORTED_CHAINS,
      supportedTokens: this.SUPPORTED_TOKENS,
      faucetLimits: {
        maxPerRequest: 100000,
        tokens: this.SUPPORTED_TOKENS,
      },
      scenarios: Object.values(SandboxScenario),
    };
  }
}
