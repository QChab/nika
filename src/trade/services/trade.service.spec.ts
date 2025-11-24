import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { TradeService } from './trade.service';
import { Trade } from '../schemas/trade.schema';
import { User } from '../../referral/schemas/user.schema';
import { Commission } from '../../referral/schemas/commission.schema';
import { ReferralService } from '../../referral/services/referral.service';
import { FEE_TIERS, FEE_DISTRIBUTION } from '../../common/constants';

const createMockUser = (overrides = {}) => ({
  _id: new Types.ObjectId(),
  referralCode: 'TESTCODE',
  referrerId: null,
  directReferrals: [],
  referralDepth: 0,
  feeTier: 'BASE' as const,
  customCommissionStructure: null,
  totalXpEarned: { toString: () => '0' },
  totalCommissionEarned: { toString: () => '0' },
  totalCashbackEarned: { toString: () => '0' },
  isActive: true,
  createdAt: new Date(),
  ...overrides,
});

const createMockTrade = (overrides = {}) => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  volume: '1000',
  feeRate: '0.01',
  totalFee: '10',
  cashbackAmount: '1',
  treasuryAmount: '5.5',
  totalCommissions: '3.5',
  token: 'BTC',
  chain: 'ARBITRUM',
  side: 'BUY',
  commissionsDistributed: false,
  createdAt: new Date(),
  save: vi.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides,
});

describe('TradeService', () => {
  let service: TradeService;
  let mockReferralService: {
    getReferralChain: ReturnType<typeof vi.fn>;
    getCommissionRateForLevel: ReturnType<typeof vi.fn>;
  };
  let tradeModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let commissionModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockReferralService = {
      getReferralChain: vi.fn().mockResolvedValue([]),
      getCommissionRateForLevel: vi.fn().mockReturnValue(new BigNumber('0.30')),
    };

    tradeModel = {
      findById: vi.fn(),
      find: vi.fn(),
      countDocuments: vi.fn(),
    };

    userModel = {
      findOne: vi.fn(),
      findById: vi.fn(),
      updateOne: vi.fn(),
    };

    commissionModel = {
      insertMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TradeService,
          useFactory: (tradeM: typeof tradeModel, userM: typeof userModel, commM: typeof commissionModel, refService: typeof mockReferralService) => {
            return new TradeService(tradeM as never, userM as never, commM as never, refService as never);
          },
          inject: [getModelToken(Trade.name), getModelToken(User.name), getModelToken(Commission.name), ReferralService],
        },
        { provide: getModelToken(Trade.name), useValue: tradeModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Commission.name), useValue: commissionModel },
        { provide: ReferralService, useValue: mockReferralService },
      ],
    }).compile();

    service = module.get<TradeService>(TradeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeeRateForTier', () => {
    it('should return correct fee rate for BASE tier', () => {
      const rate = service.getFeeRateForTier('BASE');
      expect(rate.toString()).toBe(FEE_TIERS.BASE.toString());
    });

    it('should return correct fee rate for REDUCED tier', () => {
      const rate = service.getFeeRateForTier('REDUCED');
      expect(rate.toString()).toBe(FEE_TIERS.REDUCED.toString());
    });
  });

  describe('calculateFeeDistribution', () => {
    it('should calculate correct fee distribution for standard user', async () => {
      const user = createMockUser();
      const volume = new BigNumber('10000');

      const result = await service.calculateFeeDistribution(user as never, volume, 'ARBITRUM', 'USDC');

      const expectedFee = volume.multipliedBy(FEE_TIERS.BASE);
      expect(result.totalFee.toString()).toBe(expectedFee.toString());
      expect(result.cashback.toString()).toBe(expectedFee.multipliedBy(FEE_DISTRIBUTION.CASHBACK_RATE).toString());
      expect(result.treasury.toString()).toBe(expectedFee.multipliedBy(FEE_DISTRIBUTION.TREASURY_RATE).toString());
    });

    it('should return zero fees for waived fee users', async () => {
      const user = createMockUser({
        customCommissionStructure: { type: 'WAIVED', feesWaived: true },
      });
      const volume = new BigNumber('10000');

      const result = await service.calculateFeeDistribution(user as never, volume, 'ARBITRUM', 'USDC');

      expect(result.totalFee.toString()).toBe('0');
      expect(result.cashback.toString()).toBe('0');
      expect(result.treasury.toString()).toBe('0');
      expect(result.commissions).toEqual([]);
    });

  });

  describe('calculateCommissionBreakdown', () => {
    it('should calculate commissions for referral chain', async () => {
      const traderId = new Types.ObjectId();
      const referrer1Id = new Types.ObjectId();
      const referrer2Id = new Types.ObjectId();
      const totalFee = new BigNumber('100');

      const referrer1 = createMockUser({ _id: referrer1Id });
      const referrer2 = createMockUser({ _id: referrer2Id });

      mockReferralService.getReferralChain.mockResolvedValue([
        { userId: referrer1Id.toString(), level: 1, referralCode: 'REF1' },
        { userId: referrer2Id.toString(), level: 2, referralCode: 'REF2' },
      ]);

      userModel.findById = vi.fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(referrer1) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(referrer2) });

      mockReferralService.getCommissionRateForLevel
        .mockReturnValueOnce(new BigNumber('0.30'))
        .mockReturnValueOnce(new BigNumber('0.03'));

      const result = await service.calculateCommissionBreakdown(traderId, totalFee);

      expect(result).toHaveLength(2);
      expect(result[0]?.level).toBe(1);
      expect(result[0]?.amount.toString()).toBe('30');
      expect(result[1]?.level).toBe(2);
      expect(result[1]?.amount.toString()).toBe('3');
    });

    it('should return empty array when no referral chain', async () => {
      const traderId = new Types.ObjectId();
      const totalFee = new BigNumber('100');

      mockReferralService.getReferralChain.mockResolvedValue([]);

      const result = await service.calculateCommissionBreakdown(traderId, totalFee);

      expect(result).toEqual([]);
    });

    it('should skip referrers with zero commission rate', async () => {
      const traderId = new Types.ObjectId();
      const referrerId = new Types.ObjectId();
      const totalFee = new BigNumber('100');

      const referrer = createMockUser({ _id: referrerId });

      mockReferralService.getReferralChain.mockResolvedValue([
        { userId: referrerId.toString(), level: 1, referralCode: 'REF1' },
      ]);

      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(referrer) });
      mockReferralService.getCommissionRateForLevel.mockReturnValue(new BigNumber('0'));

      const result = await service.calculateCommissionBreakdown(traderId, totalFee);

      expect(result).toEqual([]);
    });
  });

  describe('processTrade', () => {
    it('should throw BadRequestException for invalid user ID format', async () => {
      await expect(
        service.processTrade('invalid-id', '1000', 'BTC', 'BUY', 'ARBITRUM')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      const validObjectId = new Types.ObjectId().toString();
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      await expect(
        service.processTrade(validObjectId, '1000', 'BTC', 'BUY', 'ARBITRUM')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid volume', async () => {
      const user = createMockUser();
      const validObjectId = new Types.ObjectId().toString();
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(user) });

      await expect(
        service.processTrade(validObjectId, '-100', 'BTC', 'BUY', 'ARBITRUM')
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.processTrade(validObjectId, 'invalid', 'BTC', 'BUY', 'ARBITRUM')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTradeById', () => {
    it('should return trade by id', async () => {
      const trade = createMockTrade();
      tradeModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(trade) });

      const result = await service.getTradeById(trade._id);

      expect(result).toEqual(trade);
    });

    it('should return null for non-existent trade', async () => {
      tradeModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.getTradeById(new Types.ObjectId());

      expect(result).toBeNull();
    });
  });

  describe('getTradesByUser', () => {
    it('should return paginated trades for user', async () => {
      const userId = new Types.ObjectId();
      const trades = [createMockTrade({ userId }), createMockTrade({ userId })];

      tradeModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(trades),
      });
      tradeModel.countDocuments = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(2),
      });

      const result = await service.getTradesByUser(userId, 1, 20);

      expect(result.trades).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should handle pagination correctly', async () => {
      const userId = new Types.ObjectId();

      tradeModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });
      tradeModel.countDocuments = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(50),
      });

      const result = await service.getTradesByUser(userId, 3, 20);

      expect(result.trades).toHaveLength(0);
      expect(result.total).toBe(50);
      expect(tradeModel.find().skip).toHaveBeenCalledWith(40);
    });
  });

  describe('commission cascade example scenarios', () => {
    it('should calculate correct commissions for 3-level referral chain', async () => {
      const traderId = new Types.ObjectId();
      const userA = new Types.ObjectId();
      const userB = new Types.ObjectId();
      const userC = new Types.ObjectId();

      const totalFee = new BigNumber('100');

      mockReferralService.getReferralChain.mockResolvedValue([
        { userId: userC.toString(), level: 1, referralCode: 'USERC' },
        { userId: userB.toString(), level: 2, referralCode: 'USERB' },
        { userId: userA.toString(), level: 3, referralCode: 'USERA' },
      ]);

      userModel.findById = vi.fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(createMockUser({ _id: userC })) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(createMockUser({ _id: userB })) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(createMockUser({ _id: userA })) });

      mockReferralService.getCommissionRateForLevel
        .mockReturnValueOnce(new BigNumber('0.30'))
        .mockReturnValueOnce(new BigNumber('0.03'))
        .mockReturnValueOnce(new BigNumber('0.02'));

      const result = await service.calculateCommissionBreakdown(traderId, totalFee);

      expect(result).toHaveLength(3);
      expect(result[0]?.amount.toString()).toBe('30');
      expect(result[1]?.amount.toString()).toBe('3');
      expect(result[2]?.amount.toString()).toBe('2');

      const totalCommission = result.reduce((sum, c) => sum.plus(c.amount), new BigNumber(0));
      expect(totalCommission.toString()).toBe('35');
    });
  });
});
