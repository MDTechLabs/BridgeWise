/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({
    type: String,
    description: 'Type of transaction',
    enum: [
      'stellar-payment',
      'stellar-path-payment',
      'hop-bridge',
      'layerzero-omnichain',
    ],
    example: 'stellar-payment',
  })
  @IsString()
  type: string;

  @ApiProperty({
    type: Object,
    description:
      'Transaction metadata containing network-specific parameters. Structure varies based on transaction type.',
    required: false,
    example: {
      sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
      destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
      amount: '100',
      asset: 'native',
      memo: 'Cross-chain transfer',
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({
    type: Number,
    description:
      'Total number of steps required to complete this transaction. Used for step-by-step transaction advancement.',
    required: false,
    example: 3,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  totalSteps?: number;
}
