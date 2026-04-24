/**
 * Wallet Module - Re-exports from the NestJS wallet module
 * The primary implementation lives at apps/api/src/wallet/
 */
export { WalletModule } from '../../../apps/api/src/wallet/wallet.module';
export { WalletService } from '../../../apps/api/src/wallet/wallet.service';
export { WalletController } from '../../../apps/api/src/wallet/wallet.controller';
export { WalletSession, WalletSessionStatus } from '../../../apps/api/src/wallet/entities/wallet-session.entity';
export {
  ConnectWalletDto,
  DisconnectWalletDto,
  SwitchNetworkDto,
  SignMessageDto,
  GetBalanceDto,
} from '../../../apps/api/src/wallet/dto/wallet.dto';
