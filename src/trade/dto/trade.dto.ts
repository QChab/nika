import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class TradeWebhookDto {
  @ApiProperty({ description: 'User ID (ObjectId)' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ description: 'Trade volume in tokenIn' })
  @IsString()
  @IsNotEmpty()
  volume!: string;

  @ApiProperty({ description: 'Token being traded (fees taken in this token)', example: 'BTC' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: 'Trade side', enum: ['BUY', 'SELL'] })
  @IsEnum(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Blockchain chain', enum: ['ARBITRUM', 'SOLANA'] })
  @IsEnum(['ARBITRUM', 'SOLANA'])
  chain!: 'ARBITRUM' | 'SOLANA';
}

export class TradeResponseDto {
  @ApiProperty()
  tradeId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  volume!: string;

  @ApiProperty({ description: 'Token fees are taken in' })
  token!: string;

  @ApiProperty()
  totalFee!: string;

  @ApiProperty()
  cashback!: string;

  @ApiProperty()
  treasury!: string;

  @ApiProperty({ type: [Object] })
  commissions!: {
    userId: string;
    level: number;
    amount: string;
    rate: string;
  }[];

  @ApiProperty()
  chain!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class FeeBreakdownDto {
  @ApiProperty()
  totalFee!: string;

  @ApiProperty()
  cashback!: string;

  @ApiProperty()
  treasury!: string;

  @ApiProperty()
  totalCommissions!: string;

  @ApiProperty({ type: [Object] })
  commissionBreakdown!: {
    level: number;
    userId: string;
    amount: string;
    rate: string;
  }[];
}
