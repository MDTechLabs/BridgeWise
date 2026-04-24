import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectWalletDto {
  @ApiProperty({ description: 'Wallet adapter ID (e.g., metamask, freighter)', example: 'metamask' })
  @IsString()
  walletType: string;

  @ApiPropertyOptional({ description: 'Chain ID to connect to (CAIP-2 format)', example: 'eip155:1' })
  @IsOptional()
  @IsString()
  chainId?: string;

  @ApiPropertyOptional({ description: 'Additional metadata for the connection' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class DisconnectWalletDto {
  @ApiProperty({ description: 'Wallet session ID to disconnect' })
  @IsString()
  sessionId: string;
}

export class SwitchNetworkDto {
  @ApiProperty({ description: 'Target chain ID (CAIP-2 format)', example: 'eip155:137' })
  @IsString()
  chainId: string;

  @ApiPropertyOptional({ description: 'Wallet session ID (uses active if not provided)' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class SignMessageDto {
  @ApiProperty({ description: 'Message data to sign' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Wallet session ID (uses active if not provided)' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class GetBalanceDto {
  @ApiPropertyOptional({ description: 'Token address or symbol (defaults to native)' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Wallet session ID (uses active if not provided)' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
