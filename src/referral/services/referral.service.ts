import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { customAlphabet } from 'nanoid';
import BigNumber from 'bignumber.js';
import { User, UserDocument } from '../schemas/user.schema';
import { Commission, CommissionDocument } from '../schemas/commission.schema';
import {
  REFERRAL_CODE_LENGTH,
  MAX_REFERRAL_DEPTH,
  COMMISSION_RATES,
} from '../../common/constants';
import {
  ReferralChain,
  NetworkNode,
  EarningsBreakdown,
  CustomCommissionStructure,
} from '../../common/types';

const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', REFERRAL_CODE_LENGTH);

@Injectable()
export class ReferralService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Commission.name) private commissionModel: Model<CommissionDocument>
  ) {}

  async generateReferralCode(): Promise<UserDocument> {
    let referralCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      referralCode = generateCode();
      const exists = await this.userModel.findOne({ referralCode }).exec();
      if (!exists) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new ConflictException('Unable to generate unique referral code');
    }

    const user = new this.userModel({
      referralCode,
      directReferrals: [],
      referralDepth: 0,
    });

    return user.save();
  }

  async registerWithReferral(referralCode: string): Promise<UserDocument> {
    const referrer = await this.userModel.findOne({ referralCode }).exec();
    if (!referrer) {
      throw new NotFoundException('Invalid referral code');
    }

    const referrerDepth = await this.calculateReferralDepth(referrer._id);
    if (referrerDepth >= MAX_REFERRAL_DEPTH) {
      throw new BadRequestException('Maximum referral depth reached');
    }

    // Retry with different referral codes if code collision occurs
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const newReferralCode = generateCode();

      try {
        const user = new this.userModel({
          referralCode: newReferralCode,
          referrerId: referrer._id,
          directReferrals: [],
          referralDepth: referrerDepth + 1,
        });

        const result = await user.save();

        // Atomic $push to add new user to referrer's directReferrals
        await this.userModel.updateOne(
          { _id: referrer._id },
          { $push: { directReferrals: result._id } }
        );

        return result;
      } catch (error: unknown) {
        // Duplicate key error on referralCode - retry with new code
        if (error instanceof Error && 'code' in error && (error as { code: number }).code === 11000) {
          const mongoError = error as { keyPattern?: Record<string, unknown> };
          if (mongoError.keyPattern?.referralCode) {
            continue;
          }
        }
        throw error;
      }
    }

    throw new ConflictException('Unable to generate unique referral code');
  }

  async getReferralChain(userId: Types.ObjectId): Promise<ReferralChain[]> {
    const chain: ReferralChain[] = [];
    let currentUser = await this.userModel.findById(userId).exec();
    let level = 1;

    while (currentUser?.referrerId && level <= MAX_REFERRAL_DEPTH) {
      const referrer = await this.userModel.findById(currentUser.referrerId).exec();
      if (!referrer) break;

      chain.push({
        userId: referrer._id.toString(),
        level,
        referralCode: referrer.referralCode,
      });

      currentUser = referrer;
      level++;
    }

    return chain;
  }

  async getNetwork(
    userId: Types.ObjectId
  ): Promise<{ data: NetworkNode[]; total: number }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const buildNetworkTree = async (
      currentUserId: Types.ObjectId,
      currentLevel: number
    ): Promise<NetworkNode[]> => {
      if (currentLevel > MAX_REFERRAL_DEPTH) return [];

      const currentUser = await this.userModel
        .findById(currentUserId)
        .populate('directReferrals')
        .exec();

      if (!currentUser) return [];

      const nodes: NetworkNode[] = [];

      for (const refId of currentUser.directReferrals) {
        const referral = await this.userModel.findById(refId).exec();
        if (!referral) continue;

        const node: NetworkNode = {
          userId: referral._id.toString(),
          referralCode: referral.referralCode,
          level: currentLevel,
          joinedAt: referral.createdAt,
        };

        if (currentLevel < MAX_REFERRAL_DEPTH) {
          node.directReferrals = await buildNetworkTree(referral._id, currentLevel + 1);
        }

        nodes.push(node);
      }

      return nodes;
    };

    const fullNetwork = await buildNetworkTree(userId, 1);

    const flattenNetwork = (nodes: NetworkNode[]): NetworkNode[] => {
      const result: NetworkNode[] = [];
      for (const node of nodes) {
        result.push({ ...node, directReferrals: undefined });
        if (node.directReferrals) {
          result.push(...flattenNetwork(node.directReferrals));
        }
      }
      return result;
    };

    const flatNodes = flattenNetwork(fullNetwork);

    return {
      data: flatNodes,
      total: flatNodes.length,
    };
  }

  async getEarnings(
    userId: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    byLevel: { level: number; earnings: EarningsBreakdown[]; levelTotal: string; levelClaimed: string; levelUnclaimed: string }[];
    grandTotal: string;
    totalClaimed: string;
    totalUnclaimed: string;
  }> {
    // Build date range filter if provided
    const matchFilter: { userId: Types.ObjectId; createdAt?: { $gte?: Date; $lte?: Date } } = { userId };
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = startDate;
      if (endDate) matchFilter.createdAt.$lte = endDate;
    }

    const commissions = await this.commissionModel
      .aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: { sourceUserId: '$sourceUserId', level: '$level' },
            totalEarned: { $sum: { $toDecimal: '$amount' } },
            claimed: {
              $sum: {
                $cond: ['$isClaimed', { $toDecimal: '$amount' }, 0],
              },
            },
            unclaimed: {
              $sum: {
                $cond: ['$isClaimed', 0, { $toDecimal: '$amount' }],
              },
            },
          },
        },
        { $sort: { '_id.level': 1, totalEarned: -1 } },
      ])
      .exec() as {
        _id: { sourceUserId: Types.ObjectId; level: number };
        totalEarned: { toString(): string };
        claimed: { toString(): string };
        unclaimed: { toString(): string };
      }[];

    const levelMap = new Map<number, EarningsBreakdown[]>();

    for (const comm of commissions) {
      const lvl = comm._id.level;
      if (!levelMap.has(lvl)) {
        levelMap.set(lvl, []);
      }
      levelMap.get(lvl)!.push({
        userId: comm._id.sourceUserId.toString(),
        level: lvl,
        totalEarned: comm.totalEarned.toString(),
        claimed: comm.claimed.toString(),
        unclaimed: comm.unclaimed.toString(),
      });
    }

    let grandTotal = new BigNumber(0);
    let totalClaimed = new BigNumber(0);
    let totalUnclaimed = new BigNumber(0);

    const byLevel = Array.from(levelMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([lvl, earnings]) => {
        const levelTotal = earnings.reduce((sum, e) => sum.plus(e.totalEarned), new BigNumber(0));
        const levelClaimed = earnings.reduce((sum, e) => sum.plus(e.claimed), new BigNumber(0));
        const levelUnclaimed = earnings.reduce((sum, e) => sum.plus(e.unclaimed), new BigNumber(0));

        grandTotal = grandTotal.plus(levelTotal);
        totalClaimed = totalClaimed.plus(levelClaimed);
        totalUnclaimed = totalUnclaimed.plus(levelUnclaimed);

        return {
          level: lvl,
          earnings,
          levelTotal: levelTotal.toString(),
          levelClaimed: levelClaimed.toString(),
          levelUnclaimed: levelUnclaimed.toString(),
        };
      });

    return {
      byLevel,
      grandTotal: grandTotal.toString(),
      totalClaimed: totalClaimed.toString(),
      totalUnclaimed: totalUnclaimed.toString(),
    };
  }

  async getClaimableAmount(userId: Types.ObjectId): Promise<{ commission: string; cashback: string }> {
    const result = await this.commissionModel
      .aggregate([
        { $match: { userId, isClaimed: false } },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDecimal: '$amount' } },
          },
        },
      ])
      .exec() as { _id: null; total: { toString(): string } | null }[];

    const user = await this.userModel.findById(userId).exec();
    const cashback = user?.totalCashbackEarned?.toString() ?? '0';

    return {
      commission: result[0]?.total?.toString() ?? '0',
      cashback: cashback,
    };
  }

  getCommissionRateForLevel(
    level: number,
    customStructure?: CustomCommissionStructure | null
  ): BigNumber {
    if (customStructure?.commissionsWaived) {
      return new BigNumber(0);
    }

    if (customStructure) {
      switch (customStructure.type) {
        case 'KOL_DIRECT':
          return level === 1 ? new BigNumber('0.50') : new BigNumber(0);
        case 'KOL_CUSTOM':
          if (level === 1 && customStructure.level1Rate) return new BigNumber(customStructure.level1Rate);
          if (level === 2 && customStructure.level2Rate) return new BigNumber(customStructure.level2Rate);
          if (level === 3 && customStructure.level3Rate) return new BigNumber(customStructure.level3Rate);
          break;
        case 'WAIVED':
          return new BigNumber(0);
      }
    }

    switch (level) {
      case 1:
        return COMMISSION_RATES.LEVEL_1;
      case 2:
        return COMMISSION_RATES.LEVEL_2;
      case 3:
        return COMMISSION_RATES.LEVEL_3;
      default:
        return new BigNumber(0);
    }
  }

  async findUserById(userId: Types.ObjectId): Promise<UserDocument | null> {
    return this.userModel.findById(userId).exec();
  }

  async findUserByReferralCode(referralCode: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ referralCode }).exec();
  }

  async getAllUsers() {
    const users = await this.userModel.find().sort({ createdAt: -1 }).exec();

    // Aggregate commissions by user and token
    const commissionsByUser = await this.commissionModel.aggregate([
      {
        $group: {
          _id: { userId: '$userId', token: '$token' },
          total: { $sum: { $toDecimal: '$amount' } },
        },
      },
    ]).exec() as { _id: { userId: Types.ObjectId; token: string }; total: { toString(): string } }[];

    // Build a map of userId -> { token: amount }
    const userCommissionsMap = new Map<string, Record<string, string>>();
    for (const entry of commissionsByUser) {
      const odId = entry._id.userId.toString();
      if (!userCommissionsMap.has(odId)) {
        userCommissionsMap.set(odId, {});
      }
      userCommissionsMap.get(odId)![entry._id.token] = entry.total.toString();
    }

    return users.map((user) => ({
      id: user._id.toString(),
      referralCode: user.referralCode,
      referrerId: user.referrerId?.toString() ?? null,
      feeTier: user.feeTier,
      commissionsByToken: userCommissionsMap.get(user._id.toString()) ?? {},
      totalCashbackEarned: user.totalCashbackEarned?.toString() ?? '0',
      totalXpEarned: user.totalXpEarned?.toString() ?? '0',
      createdAt: user.createdAt,
    }));
  }

  private async calculateReferralDepth(userId: Types.ObjectId): Promise<number> {
    let depth = 0;
    let currentUser = await this.userModel.findById(userId).exec();

    while (currentUser?.referrerId) {
      depth++;
      currentUser = await this.userModel.findById(currentUser.referrerId).exec();
    }

    return depth;
  }
}
