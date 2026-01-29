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
import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../entities/transaction.entity';

// export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}

export class UpdateTransactionDto {
  @ApiProperty({
    enum: TransactionStatus,
    description: 'Updated transaction status',
    required: false,
    example: 'completed',
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({
    type: Object,
    description:
      'Updated internal state object. Typically contains boolean flags for transaction milestones (validated, submitted, confirmed).',
    required: false,
    example: {
      validated: true,
      submitted: true,
      confirmed: true,
    },
  })
  @IsOptional()
  @IsObject()
  state?: Record<string, any>;

  @ApiProperty({
    type: Number,
    description:
      'Current step number in the transaction workflow. Should be incremented as transaction progresses.',
    required: false,
    example: 2,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  currentStep?: number;

  @ApiProperty({
    type: String,
    description:
      'Error message if transaction has failed. Populated when status is "failed" or "error".',
    required: false,
    example: 'Insufficient balance for transaction',
  })
  @IsOptional()
  @IsString()
  error?: string;
}
