import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class RegisterWithReferralDto {
  @ApiProperty({ description: 'Referral code to register with' })
  @IsString()
  @IsNotEmpty()
  referralCode!: string;
}

export class ClaimDto {
  @ApiProperty({ description: 'Amount to claim' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ description: 'Chain to claim on', enum: ['ARBITRUM', 'SOLANA'] })
  @IsEnum(['ARBITRUM', 'SOLANA'])
  chain!: 'ARBITRUM' | 'SOLANA';

  @ApiProperty({ description: 'Type of claim', enum: ['COMMISSION', 'CASHBACK'] })
  @IsEnum(['COMMISSION', 'CASHBACK'])
  claimType!: 'COMMISSION' | 'CASHBACK';
}

export class GetEarningsQueryDto {
  @ApiPropertyOptional({ description: 'Start date for filtering (ISO 8601)', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering (ISO 8601)', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ReferralCodeResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  referralCode!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class NetworkResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  referralCode!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  joinedAt!: Date;

  @ApiProperty({ type: [NetworkResponseDto], required: false })
  directReferrals?: NetworkResponseDto[];
}

export class EarningsResponseDto {
  @ApiProperty()
  level!: number;

  @ApiProperty({ type: [Object] })
  earnings!: {
    userId: string;
    totalEarned: string;
    claimed: string;
    unclaimed: string;
  }[];

  @ApiProperty()
  levelTotal!: string;

  @ApiProperty()
  levelClaimed!: string;

  @ApiProperty()
  levelUnclaimed!: string;
}

export class TotalEarningsResponseDto {
  @ApiProperty({ type: [EarningsResponseDto] })
  byLevel!: EarningsResponseDto[];

  @ApiProperty()
  grandTotal!: string;

  @ApiProperty()
  totalClaimed!: string;

  @ApiProperty()
  totalUnclaimed!: string;

  @ApiProperty()
  totalCashback!: string;

  @ApiProperty()
  totalXp!: string;
}
