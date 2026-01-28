/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  totalSteps?: number;
}
