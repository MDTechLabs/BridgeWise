import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class GetQuoteDto {
  @IsString()
  @IsNotEmpty()
  fromChain!: string;

  @IsString()
  @IsNotEmpty()
  toChain!: string;

  @IsString()
  @IsNotEmpty()
  fromToken!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsOptional()
  toToken?: string;
}

export interface QuoteOption {
  id: string;
  provider: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeToken: string;
  estimatedTimeSeconds: number;
  netOutputAmount: string; // net execution output after fees
}
