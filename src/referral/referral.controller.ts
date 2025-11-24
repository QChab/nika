import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ReferralService } from './services/referral.service';
import {
  RegisterWithReferralDto,
  ClaimDto,
  GetEarningsQueryDto,
  ReferralCodeResponseDto,
  TotalEarningsResponseDto,
} from './dto/referral.dto';
import { NetworkNode } from '../common/types';

@ApiTags('Referral')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('users')
  @ApiResponse({ status: 200, description: 'List of all users' })
  async getAllUsers() {
    return this.referralService.getAllUsers();
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, description: 'User created with referral code', type: ReferralCodeResponseDto })
  @ApiResponse({ status: 409, description: 'Unable to generate unique code' })
  async generateReferralCode(): Promise<ReferralCodeResponseDto> {
    const user = await this.referralService.generateReferralCode();
    return {
      userId: user._id.toString(),
      referralCode: user.referralCode,
      createdAt: user.createdAt,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, description: 'User registered successfully', type: ReferralCodeResponseDto })
  @ApiResponse({ status: 400, description: 'Maximum referral depth reached' })
  @ApiResponse({ status: 404, description: 'Invalid referral code' })
  @ApiResponse({ status: 409, description: 'Unable to generate unique code' })
  async registerWithReferral(
    @Body() dto: RegisterWithReferralDto
  ): Promise<ReferralCodeResponseDto> {
    const user = await this.referralService.registerWithReferral(dto.referralCode);
    return {
      userId: user._id.toString(),
      referralCode: user.referralCode,
      createdAt: user.createdAt,
    };
  }

  @Get('network')
  @ApiHeader({ name: 'x-user-id', description: 'User ID (ObjectId)', required: true })
  @ApiResponse({ status: 200, description: 'Network retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getNetwork(
    @Headers('x-user-id') userIdHeader: string
  ): Promise<{ data: NetworkNode[]; total: number }> {
    const userId = this.resolveUserId(userIdHeader);
    return this.referralService.getNetwork(userId);
  }

  @Get('earnings')
  @ApiHeader({ name: 'x-user-id', description: 'User ID (ObjectId)', required: true })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for filtering (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for filtering (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Earnings retrieved successfully', type: TotalEarningsResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getEarnings(
    @Headers('x-user-id') userIdHeader: string,
    @Query() query: GetEarningsQueryDto
  ): Promise<TotalEarningsResponseDto> {
    const userId = this.resolveUserId(userIdHeader);
    const user = await this.referralService.findUserById(userId);

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const result = await this.referralService.getEarnings(userId, startDate, endDate);

    return {
      ...result,
      totalCashback: user?.totalCashbackEarned?.toString() ?? '0',
      totalXp: user?.totalXpEarned?.toString() ?? '0',
    };
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-user-id', description: 'User ID (ObjectId)', required: true })
  @ApiResponse({ status: 200, description: 'Claim initiated' })
  @ApiResponse({ status: 400, description: 'Invalid claim amount or no claimable balance' })
  async claim(
    @Headers('x-user-id') userIdHeader: string,
    @Body() dto: ClaimDto
  ): Promise<{ message: string; claimId: string }> {
    const userId = this.resolveUserId(userIdHeader);
    const claimable = await this.referralService.getClaimableAmount(userId);

    const requestedAmount = parseFloat(dto.amount);
    const availableAmount =
      dto.claimType === 'COMMISSION'
        ? parseFloat(claimable.commission)
        : parseFloat(claimable.cashback);

    if (requestedAmount <= 0 || requestedAmount > availableAmount) {
      throw new BadRequestException('Invalid claim amount or insufficient claimable balance');
    }

    return {
      message: 'Claim endpoint signature validated. Implementation pending smart contract integration.',
      claimId: new Types.ObjectId().toString(),
    };
  }

  @Get('claimable')
  @ApiHeader({ name: 'x-user-id', description: 'User ID (ObjectId)', required: true })
  @ApiResponse({ status: 200, description: 'Claimable amounts retrieved' })
  async getClaimable(
    @Headers('x-user-id') userIdHeader: string
  ): Promise<{ commission: string; cashback: string }> {
    const userId = this.resolveUserId(userIdHeader);
    return this.referralService.getClaimableAmount(userId);
  }

  private resolveUserId(userIdHeader: string): Types.ObjectId {
    if (!userIdHeader) {
      throw new BadRequestException('User ID header is required');
    }

    if (!Types.ObjectId.isValid(userIdHeader)) {
      throw new BadRequestException('Invalid user ID format');
    }

    return new Types.ObjectId(userIdHeader);
  }
}
