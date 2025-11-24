import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Decimal128 } from 'bson';
import BigNumber from 'bignumber.js';
import { Trade, TradeDocument } from '../schemas/trade.schema';
import { User, UserDocument } from '../../referral/schemas/user.schema';
import { Commission, CommissionDocument } from '../../referral/schemas/commission.schema';
import { ReferralService } from '../../referral/services/referral.service';
import { FEE_DISTRIBUTION, FEE_TIERS, Chain } from '../../common/constants';
import { FeeDistribution, CommissionBreakdown } from '../../common/types';

@Injectable()
export class TradeService {
  constructor(
    @InjectModel(Trade.name) private tradeModel: Model<TradeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Commission.name) private commissionModel: Model<CommissionDocument>,
    private referralService: ReferralService
  ) {}

  async processTrade(
    userId: string,
    volume: string,
    token: string,
    side: 'BUY' | 'SELL',
    chain: Chain
  ): Promise<{
    trade: TradeDocument;
    feeDistribution: FeeDistribution;
  }> {
    if (!this.isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const volumeBN = new BigNumber(volume);
    if (volumeBN.isNaN() || volumeBN.isLessThanOrEqualTo(0)) {
      throw new BadRequestException('Invalid trade volume');
    }

    const feeDistribution = await this.calculateFeeDistribution(
      user,
      volumeBN,
      chain,
      token
    );

    // Create trade record first
    const trade = new this.tradeModel({
      userId: user._id,
      volume,
      feeRate: this.getFeeRateForTier(user.feeTier).toString(),
      totalFee: feeDistribution.totalFee.toString(),
      cashbackAmount: feeDistribution.cashback.toString(),
      treasuryAmount: feeDistribution.treasury.toString(),
      totalCommissions: feeDistribution.commissions
        .reduce((sum, c) => sum.plus(c.amount), new BigNumber(0))
        .toString(),
      token,
      chain,
      side,
      commissionsDistributed: false,
    });

    await trade.save();

    // Distribute commissions using atomic $inc operations
    await this.distributeCommissions(
      trade._id,
      user._id,
      feeDistribution
    );

    // Mark trade as distributed
    trade.commissionsDistributed = true;
    trade.distributedAt = new Date();
    await trade.save();

    // Update trader's cashback using atomic $inc
    await this.updateUserStats(user._id, feeDistribution);

    return { trade, feeDistribution };
  }

  async calculateFeeDistribution(
    user: UserDocument,
    volume: BigNumber,
    chain: Chain,
    token: string
  ): Promise<FeeDistribution> {
    const isFeesWaived = user.customCommissionStructure?.feesWaived ?? false;
    let totalFee: BigNumber;

    if (isFeesWaived) {
      totalFee = new BigNumber(0);
    } else {
      // Fee is calculated based on user's tier: 1% for BASE, 0.5% for REDUCED
      const feeRate = this.getFeeRateForTier(user.feeTier);
      totalFee = volume.multipliedBy(feeRate);
    }

    if (totalFee.isZero()) {
      return {
        traderId: user._id.toString(),
        totalFee,
        cashback: new BigNumber(0),
        commissions: [],
        treasury: new BigNumber(0),
        chain,
        token,
      };
    }

    const cashback = totalFee.multipliedBy(FEE_DISTRIBUTION.CASHBACK_RATE);
    const treasury = totalFee.multipliedBy(FEE_DISTRIBUTION.TREASURY_RATE);
    const commissions = await this.calculateCommissionBreakdown(
      user._id,
      totalFee
    );

    return {
      traderId: user._id.toString(),
      totalFee,
      cashback,
      commissions,
      treasury,
      chain,
      token,
    };
  }

  async calculateCommissionBreakdown(
    traderId: Types.ObjectId,
    totalFee: BigNumber
  ): Promise<CommissionBreakdown[]> {
    const commissions: CommissionBreakdown[] = [];
    const referralChain = await this.referralService.getReferralChain(traderId);

    for (const referrer of referralChain) {
      const referrerUser = await this.userModel.findById(referrer.userId).exec();
      if (!referrerUser) continue;

      const rate = this.referralService.getCommissionRateForLevel(
        referrer.level,
        referrerUser.customCommissionStructure
          ? {
              type: referrerUser.customCommissionStructure.type,
              level1Rate: referrerUser.customCommissionStructure.level1Rate
                ? new BigNumber(referrerUser.customCommissionStructure.level1Rate)
                : undefined,
              level2Rate: referrerUser.customCommissionStructure.level2Rate
                ? new BigNumber(referrerUser.customCommissionStructure.level2Rate)
                : undefined,
              level3Rate: referrerUser.customCommissionStructure.level3Rate
                ? new BigNumber(referrerUser.customCommissionStructure.level3Rate)
                : undefined,
              feesWaived: referrerUser.customCommissionStructure.feesWaived,
              commissionsWaived: referrerUser.customCommissionStructure.commissionsWaived,
            }
          : null
      );

      if (rate.isGreaterThan(0)) {
        const amount = totalFee.multipliedBy(rate);
        commissions.push({
          level: referrer.level,
          userId: referrer.userId,
          amount,
          rate,
        });
      }
    }

    return commissions;
  }

  // Uses atomic $inc - safe for concurrent trades
  private async distributeCommissions(
    tradeId: Types.ObjectId,
    sourceUserId: Types.ObjectId,
    distribution: FeeDistribution
  ): Promise<void> {
    const commissionDocs = distribution.commissions.map((comm) => ({
      userId: new Types.ObjectId(comm.userId),
      sourceUserId,
      tradeId,
      level: comm.level,
      amount: comm.amount.toString(),
      rate: comm.rate.toString(),
      tradeVolume: distribution.totalFee.dividedBy(this.getFeeRateForTier('BASE')).toString(),
      tradeFee: distribution.totalFee.toString(),
      token: distribution.token,
      chain: distribution.chain,
      isClaimed: false,
    }));

    if (commissionDocs.length > 0) {
      await this.commissionModel.insertMany(commissionDocs);
    }

    // Atomic $inc for each referrer's balance - safe for concurrent updates
    // Uses Decimal128 for high-precision financial calculations
    for (const comm of distribution.commissions) {
      const amount = Decimal128.fromString(comm.amount.toString());
      await this.userModel.updateOne(
        { _id: comm.userId },
        {
          $inc: {
            totalCommissionEarned: amount,
            totalXpEarned: amount,
          },
        }
      );
    }
  }

  // Atomic $inc for user stats - safe for concurrent trades
  // Uses Decimal128 for high-precision financial calculations
  private async updateUserStats(
    userId: Types.ObjectId,
    distribution: FeeDistribution
  ): Promise<void> {
    const cashbackAmount = Decimal128.fromString(distribution.cashback.toString());
    await this.userModel.updateOne(
      { _id: userId },
      {
        $inc: {
          totalCashbackEarned: cashbackAmount,
          totalXpEarned: cashbackAmount,
        },
      }
    );
  }

  getFeeRateForTier(tier: 'BASE' | 'REDUCED'): BigNumber {
    switch (tier) {
      case 'REDUCED':
        return FEE_TIERS.REDUCED;
      default:
        return FEE_TIERS.BASE;
    }
  }

  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
  }

  async getTradeById(tradeId: Types.ObjectId): Promise<TradeDocument | null> {
    return this.tradeModel.findById(tradeId).exec();
  }

  async getTradesByUser(
    userId: Types.ObjectId,
    page = 1,
    limit = 20
  ): Promise<{ trades: TradeDocument[]; total: number }> {
    const [trades, total] = await Promise.all([
      this.tradeModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.tradeModel.countDocuments({ userId }).exec(),
    ]);

    return { trades, total };
  }

  async getAllTrades(userId?: string) {
    let query = {};
    if (userId && this.isValidObjectId(userId)) {
      query = { userId: new Types.ObjectId(userId) };
    }

    const trades = await this.tradeModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();

    return trades.map((trade) => ({
      id: trade._id.toString(),
      userId: trade.userId.toString(),
      volume: trade.volume,
      token: trade.token,
      totalFee: trade.totalFee,
      cashbackAmount: trade.cashbackAmount,
      treasuryAmount: trade.treasuryAmount,
      totalCommissions: trade.totalCommissions,
      side: trade.side,
      chain: trade.chain,
      createdAt: trade.createdAt,
    }));
  }
}
