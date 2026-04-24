import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { WalletSession, WalletSessionStatus } from './entities/wallet-session.entity';
import { ConnectWalletDto, DisconnectWalletDto, SwitchNetworkDto } from './dto/wallet.dto';

/**
 * Wallet Service
 * Manages wallet sessions and provides server-side wallet operations
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletSession)
    private readonly sessionRepo: Repository<WalletSession>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Session Management ──────────────────────────────────────────────────

  /**
   * Create a new wallet session when a wallet connects
   */
  async createSession(dto: ConnectWalletDto): Promise<WalletSession> {
    const session = this.sessionRepo.create({
      walletType: dto.walletType,
      networkType: this.inferNetworkType(dto.walletType),
      address: '',
      chainId: dto.chainId || undefined,
      status: WalletSessionStatus.ACTIVE,
      metadata: dto.metadata || {},
      connectedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const saved = await this.sessionRepo.save(session);

    this.eventEmitter.emit('wallet.connected', {
      sessionId: saved.id,
      walletType: saved.walletType,
      networkType: saved.networkType,
    });

    this.logger.log(`Wallet session created: ${saved.id} (${saved.walletType})`);
    return saved;
  }

  /**
   * Update a wallet session with account info after successful connection
   */
  async updateSessionAccount(
    sessionId: string,
    address: string,
    publicKey?: string,
    chainId?: string,
  ): Promise<WalletSession> {
    const session = await this.findById(sessionId);
    session.address = address;
    if (publicKey) session.publicKey = publicKey;
    if (chainId) session.chainId = chainId;

    return this.sessionRepo.save(session);
  }

  /**
   * Disconnect a wallet session
   */
  async disconnectSession(dto: DisconnectWalletDto): Promise<WalletSession> {
    const session = await this.findById(dto.sessionId);

    if (session.status !== WalletSessionStatus.ACTIVE) {
      throw new BadRequestException(`Session ${dto.sessionId} is not active`);
    }

    session.status = WalletSessionStatus.DISCONNECTED;
    session.disconnectedAt = new Date();

    const updated = await this.sessionRepo.save(session);

    this.eventEmitter.emit('wallet.disconnected', {
      sessionId: updated.id,
      walletType: updated.walletType,
    });

    this.logger.log(`Wallet session disconnected: ${updated.id}`);
    return updated;
  }

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<WalletSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Wallet session ${id} not found`);
    }
    return session;
  }

  /**
   * Find active session by address
   */
  async findActiveByAddress(address: string): Promise<WalletSession | null> {
    return this.sessionRepo.findOne({
      where: {
        address,
        status: WalletSessionStatus.ACTIVE,
      },
      order: { connectedAt: 'DESC' },
    });
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<WalletSession[]> {
    return this.sessionRepo.find({
      where: { status: WalletSessionStatus.ACTIVE },
      order: { connectedAt: 'DESC' },
    });
  }

  /**
   * Get sessions by wallet type
   */
  async getSessionsByType(walletType: string): Promise<WalletSession[]> {
    return this.sessionRepo.find({
      where: { walletType },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Network Operations ──────────────────────────────────────────────────

  /**
   * Record a network switch event
   */
  async recordNetworkSwitch(dto: SwitchNetworkDto): Promise<WalletSession> {
    const sessionId = dto.sessionId;
    let session: WalletSession;

    if (sessionId) {
      session = await this.findById(sessionId);
    } else {
      const active = await this.getActiveSessions();
      if (active.length === 0) {
        throw new BadRequestException('No active wallet session');
      }
      session = active[0];
    }

    const previousChainId = session.chainId;
    session.chainId = dto.chainId;

    const updated = await this.sessionRepo.save(session);

    this.eventEmitter.emit('wallet.networkChanged', {
      sessionId: updated.id,
      previousChainId,
      newChainId: dto.chainId,
    });

    this.logger.log(
      `Network switched: ${previousChainId} → ${dto.chainId} (session: ${updated.id})`,
    );

    return updated;
  }

  // ─── Utility Methods ──────────────────────────────────────────────────────

  /**
   * Infer network type from wallet type
   */
  private inferNetworkType(walletType: string): string {
    const evmWallets = ['metamask', 'walletconnect', 'injected'];
    const stellarWallets = ['freighter', 'rabet', 'albedo', 'xbull'];

    if (evmWallets.includes(walletType.toLowerCase())) return 'evm';
    if (stellarWallets.includes(walletType.toLowerCase())) return 'stellar';
    return 'unknown';
  }

  /**
   * Check if a wallet type is supported
   */
  isWalletTypeSupported(walletType: string): boolean {
    const supportedTypes = [
      'metamask', 'walletconnect', 'injected',
      'freighter', 'rabet', 'albedo', 'xbull',
    ];
    return supportedTypes.includes(walletType.toLowerCase());
  }

  /**
   * Get available wallet types for the current environment
   */
  getAvailableWalletTypes(): { type: string; network: string; name: string }[] {
    return [
      { type: 'metamask', network: 'evm', name: 'MetaMask' },
      { type: 'walletconnect', network: 'evm', name: 'WalletConnect' },
      { type: 'freighter', network: 'stellar', name: 'Freighter' },
      { type: 'rabet', network: 'stellar', name: 'Rabet' },
      { type: 'albedo', network: 'stellar', name: 'Albedo' },
      { type: 'xbull', network: 'stellar', name: 'xBull' },
    ];
  }

  /**
   * Expire stale sessions (cleanup job)
   */
  async expireStaleSessions(): Promise<number> {
    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(WalletSession)
      .set({ status: WalletSessionStatus.EXPIRED })
      .where('status = :status', { status: WalletSessionStatus.ACTIVE })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale wallet sessions`);
    }

    return result.affected || 0;
  }

  /**
   * Get wallet session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    evm: number;
    stellar: number;
  }> {
    const total = await this.sessionRepo.count();
    const active = await this.sessionRepo.count({
      where: { status: WalletSessionStatus.ACTIVE },
    });
    const evm = await this.sessionRepo.count({
      where: { networkType: 'evm' },
    });
    const stellar = await this.sessionRepo.count({
      where: { networkType: 'stellar' },
    });

    return { total, active, evm, stellar };
  }
}
