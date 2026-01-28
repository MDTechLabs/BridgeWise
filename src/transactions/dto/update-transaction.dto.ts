/* eslint-disable @typescript-eslint/no-unsafe-call */
// import { PartialType } from '@nestjs/mapped-types';
// import { CreateTransactionDto } from './create-transaction.dto';

import {
  IsOptional,
  IsEnum,
  IsObject,
  IsNumber,
  IsString,
} from 'class-validator';
import { TransactionStatus } from '../entities/transaction.entity';

// export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsObject()
  state?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  currentStep?: number;

  @IsOptional()
  @IsString()
  error?: string;
}
