import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { WalletService } from './wallet.service';
import {
  ConnectWalletDto,
  DisconnectWalletDto,
  SwitchNetworkDto,
} from './dto/wallet.dto';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ─── Available Wallets ───────────────────────────────────────────────────

  @Get('available')
  @ApiOperation({ summary: 'Get available wallet types' })
  @ApiResponse({ status: 200, description: 'List of available wallet types' })
  getAvailableWallets() {
    return {
      wallets: this.walletService.getAvailableWalletTypes(),
    };
  }

  // ─── Session Management ──────────────────────────────────────────────────

  @Post('connect')
  @ApiOperation({ summary: 'Initialize a wallet connection session' })
  @ApiResponse({ status: 201, description: 'Wallet session created' })
  @ApiResponse({ status: 400, description: 'Invalid wallet type' })
  async connect(@Body() dto: ConnectWalletDto) {
    if (!this.walletService.isWalletTypeSupported(dto.walletType)) {
      return {
        success: false,
        error: `Unsupported wallet type: ${dto.walletType}`,
        supportedTypes: this.walletService.getAvailableWalletTypes(),
      };
    }

    const session = await this.walletService.createSession(dto);

    return {
      success: true,
      data: {
        sessionId: session.id,
        walletType: session.walletType,
        networkType: session.networkType,
        status: session.status,
        connectedAt: session.connectedAt,
      },
    };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect a wallet session' })
  @ApiResponse({ status: 200, description: 'Wallet disconnected' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async disconnect(@Body() dto: DisconnectWalletDto) {
    const session = await this.walletService.disconnectSession(dto);

    return {
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        disconnectedAt: session.disconnectedAt,
      },
    };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get active wallet sessions' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async getActiveSessions() {
    const sessions = await this.walletService.getActiveSessions();

    return {
      success: true,
      data: sessions.map((s) => ({
        sessionId: s.id,
        walletType: s.walletType,
        networkType: s.networkType,
        address: s.address,
        chainId: s.chainId,
        status: s.status,
        connectedAt: s.connectedAt,
      })),
    };
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a wallet session by ID' })
  @ApiParam({ name: 'id', description: 'Wallet session ID' })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Param('id') id: string) {
    const session = await this.walletService.findById(id);

    return {
      success: true,
      data: {
        sessionId: session.id,
        walletType: session.walletType,
        networkType: session.networkType,
        address: session.address,
        publicKey: session.publicKey,
        chainId: session.chainId,
        status: session.status,
        metadata: session.metadata,
        connectedAt: session.connectedAt,
        disconnectedAt: session.disconnectedAt,
        expiresAt: session.expiresAt,
      },
    };
  }

  // ─── Network Switching ───────────────────────────────────────────────────

  @Post('switch-network')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a network switch event' })
  @ApiResponse({ status: 200, description: 'Network switched' })
  async switchNetwork(@Body() dto: SwitchNetworkDto) {
    const session = await this.walletService.recordNetworkSwitch(dto);

    return {
      success: true,
      data: {
        sessionId: session.id,
        chainId: session.chainId,
        walletType: session.walletType,
      },
    };
  }

  // ─── Session Stats ───────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get wallet session statistics' })
  @ApiResponse({ status: 200, description: 'Session statistics' })
  async getStats() {
    const stats = await this.walletService.getSessionStats();

    return {
      success: true,
      data: stats,
    };
  }

  // ─── Session Lookup ──────────────────────────────────────────────────────

  @Get('lookup/:address')
  @ApiOperation({ summary: 'Find active session by address' })
  @ApiParam({ name: 'address', description: 'Wallet address' })
  @ApiResponse({ status: 200, description: 'Active session found' })
  async lookupByAddress(@Param('address') address: string) {
    const session = await this.walletService.findActiveByAddress(address);

    return {
      success: true,
      data: session
        ? {
            sessionId: session.id,
            walletType: session.walletType,
            networkType: session.networkType,
            address: session.address,
            chainId: session.chainId,
            status: session.status,
          }
        : null,
    };
  }
}
