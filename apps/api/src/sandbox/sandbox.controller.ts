import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import {
  SetScenarioDto,
  GetSandboxQuoteDto,
  CreateSandboxTxDto,
  FaucetRequestDto,
  TestWebhookDto,
  SandboxStatusResponse,
  SandboxQuote,
  SandboxTransaction,
} from './sandbox.types';

@ApiTags('Partner Sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current partner sandbox status, available scenarios, and limits' })
  @ApiResponse({ status: 200, description: 'Returns sandbox status' })
  getStatus(@Headers('x-partner-id') partnerId?: string): SandboxStatusResponse {
    return this.sandboxService.getStatus(partnerId || 'default');
  }

  @Post('scenarios')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configure the active simulation scenario for the partner' })
  @ApiResponse({ status: 200, description: 'Scenario successfully updated' })
  setScenario(
    @Body() dto: SetScenarioDto,
    @Headers('x-partner-id') partnerId?: string,
  ) {
    return this.sandboxService.setPartnerScenario(partnerId || 'default', dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset all simulated transactions and faucet balances for the partner' })
  @ApiResponse({ status: 200, description: 'Partner sandbox state reset' })
  reset(@Headers('x-partner-id') partnerId?: string) {
    return this.sandboxService.resetPartner(partnerId || 'default');
  }

  @Post('quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a simulated bridge quote under current sandbox scenario' })
  @ApiResponse({ status: 200, description: 'Simulated quote returned' })
  async getQuote(
    @Body() dto: GetSandboxQuoteDto,
    @Headers('x-partner-id') partnerId?: string,
  ): Promise<SandboxQuote> {
    return this.sandboxService.getQuote(dto, partnerId || 'default');
  }

  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a simulated bridge transaction with lifecycle steps' })
  @ApiResponse({ status: 201, description: 'Simulated transaction created' })
  async createTransaction(
    @Body() dto: CreateSandboxTxDto,
    @Headers('x-partner-id') partnerId?: string,
  ): Promise<SandboxTransaction> {
    return this.sandboxService.createTransaction(dto, partnerId || 'default');
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List simulated transactions for the partner' })
  @ApiResponse({ status: 200, description: 'List of sandbox transactions' })
  listTransactions(@Headers('x-partner-id') partnerId?: string): SandboxTransaction[] {
    return this.sandboxService.listTransactions(partnerId || 'default');
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get details and lifecycle status of a simulated transaction' })
  @ApiResponse({ status: 200, description: 'Sandbox transaction details' })
  getTransaction(
    @Param('id') id: string,
    @Headers('x-partner-id') partnerId?: string,
  ): SandboxTransaction {
    return this.sandboxService.getTransaction(id, partnerId || 'default');
  }

  @Post('faucet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mint simulated test tokens (USDC, XLM, ETH) to partner wallet' })
  @ApiResponse({ status: 200, description: 'Test tokens minted' })
  mintTokens(
    @Body() dto: FaucetRequestDto,
    @Headers('x-partner-id') partnerId?: string,
  ) {
    return this.sandboxService.mintFaucetTokens(partnerId || 'default', dto);
  }

  @Post('webhooks/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispatch a test webhook event to verify partner webhook integration' })
  @ApiResponse({ status: 200, description: 'Simulated webhook dispatched' })
  async simulateWebhook(
    @Body() dto: TestWebhookDto,
    @Headers('x-partner-id') partnerId?: string,
  ) {
    return this.sandboxService.simulateWebhook(partnerId || 'default', dto);
  }
}
