import { describe, it, expect, beforeEach, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { ReferralService } from './referral.service';
import { User } from '../schemas/user.schema';
import { Commission } from '../schemas/commission.schema';
import { COMMISSION_RATES } from '../../common/constants';

const createMockUser = (overrides = {}) => ({
  _id: new Types.ObjectId(),
  referralCode: 'TESTCODE',
  referrerId: null,
  directReferrals: [],
  referralDepth: 0,
  feeTier: 'BASE',
  customCommissionStructure: null,
  totalXpEarned: { toString: () => '0' },
  totalCommissionEarned: { toString: () => '0' },
  totalCashbackEarned: { toString: () => '0' },
  isActive: true,
  createdAt: new Date(),
  save: vi.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides,
});

describe('ReferralService', () => {
  let service: ReferralService;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let commissionModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    userModel = {
      findOne: vi.fn(),
      findById: vi.fn(),
      updateOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      create: vi.fn(),
    };

    commissionModel = {
      aggregate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Commission.name), useValue: commissionModel },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReferralCode', () => {
    it('should generate unique referral code for new user', async () => {
      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const mockSave = vi.fn().mockImplementation(function (this: unknown) {
        return Promise.resolve(this);
      });

      const mockUserInstance = {
        referralCode: expect.any(String),
        save: mockSave,
      };

      const originalUserModel = userModel;
      Object.assign(service, {
        userModel: Object.assign(
          function (this: unknown, data: Record<string, unknown>) {
            return { ...mockUserInstance, ...data, save: mockSave };
          },
          originalUserModel
        ),
      });

      const result = await service.generateReferralCode();

      expect(result.referralCode).toBeDefined();
    });

    it('should throw ConflictException after max attempts', async () => {
      const existingCode = createMockUser();
      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(existingCode) });

      await expect(service.generateReferralCode()).rejects.toThrow(ConflictException);
    });
  });

  describe('registerWithReferral', () => {
    it('should throw NotFoundException for invalid referral code', async () => {
      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      await expect(service.registerWithReferral('INVALIDCODE')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when max depth reached', async () => {
      const level3User = createMockUser({ _id: new Types.ObjectId(), referrerId: null });
      const level2User = createMockUser({ _id: new Types.ObjectId(), referrerId: level3User._id });
      const level1User = createMockUser({ _id: new Types.ObjectId(), referrerId: level2User._id });
      const referrer = createMockUser({ _id: new Types.ObjectId(), referrerId: level1User._id, referralCode: 'REFCODE' });

      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(referrer) });
      userModel.findById = vi.fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(referrer) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level1User) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level2User) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level3User) });

      await expect(service.registerWithReferral('REFCODE')).rejects.toThrow(BadRequestException);
    });

    it('should successfully register new user with referral', async () => {
      const referrer = createMockUser({ referralCode: 'REFCODE', referrerId: null });
      const newUserId = new Types.ObjectId();

      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(referrer) });
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(referrer) });
      userModel.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

      const mockSave = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, _id: newUserId });
      });

      Object.assign(service, {
        userModel: Object.assign(
          function (this: unknown, data: Record<string, unknown>) {
            return { ...data, _id: newUserId, save: mockSave };
          },
          userModel
        ),
      });

      const result = await service.registerWithReferral('REFCODE');

      expect(result.referralCode).toBeDefined();
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: referrer._id },
        { $push: { directReferrals: newUserId } }
      );
    });
  });

  describe('getReferralChain', () => {
    it('should return empty array for user without referrer', async () => {
      const user = createMockUser({ referrerId: null });
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(user) });

      const result = await service.getReferralChain(user._id);

      expect(result).toEqual([]);
    });

    it('should return chain of referrers up to 3 levels', async () => {
      const level3Referrer = createMockUser({
        _id: new Types.ObjectId(),
        referralCode: 'LEVEL3',
        referrerId: null,
      });
      const level2Referrer = createMockUser({
        _id: new Types.ObjectId(),
        referralCode: 'LEVEL2',
        referrerId: level3Referrer._id,
      });
      const level1Referrer = createMockUser({
        _id: new Types.ObjectId(),
        referralCode: 'LEVEL1',
        referrerId: level2Referrer._id,
      });
      const user = createMockUser({
        referrerId: level1Referrer._id,
      });

      userModel.findById = vi.fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(user) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level1Referrer) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level2Referrer) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(level3Referrer) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.getReferralChain(user._id);

      expect(result).toHaveLength(3);
      expect(result[0]?.level).toBe(1);
      expect(result[0]?.referralCode).toBe('LEVEL1');
      expect(result[1]?.level).toBe(2);
      expect(result[2]?.level).toBe(3);
    });
  });

  describe('getCommissionRateForLevel', () => {
    it('should return standard rates for users without custom structure', () => {
      expect(service.getCommissionRateForLevel(1, null).toString()).toBe(COMMISSION_RATES.LEVEL_1.toString());
      expect(service.getCommissionRateForLevel(2, null).toString()).toBe(COMMISSION_RATES.LEVEL_2.toString());
      expect(service.getCommissionRateForLevel(3, null).toString()).toBe(COMMISSION_RATES.LEVEL_3.toString());
      expect(service.getCommissionRateForLevel(4, null).toString()).toBe('0');
    });

    it('should return 50% for KOL_DIRECT level 1', () => {
      const customStructure = { type: 'KOL_DIRECT' as const };
      expect(service.getCommissionRateForLevel(1, customStructure).toString()).toBe('0.5');
      expect(service.getCommissionRateForLevel(2, customStructure).toString()).toBe('0');
    });

    it('should return custom rates for KOL_CUSTOM', () => {
      const customStructure = {
        type: 'KOL_CUSTOM' as const,
        level1Rate: new BigNumber('0.40'),
        level2Rate: new BigNumber('0.05'),
        level3Rate: new BigNumber('0.03'),
      };

      expect(service.getCommissionRateForLevel(1, customStructure).toString()).toBe('0.4');
      expect(service.getCommissionRateForLevel(2, customStructure).toString()).toBe('0.05');
      expect(service.getCommissionRateForLevel(3, customStructure).toString()).toBe('0.03');
    });

    it('should return 0 for WAIVED type', () => {
      const customStructure = { type: 'WAIVED' as const };
      expect(service.getCommissionRateForLevel(1, customStructure).toString()).toBe('0');
    });

    it('should return 0 when commissionsWaived is true', () => {
      const customStructure = {
        type: 'KOL_DIRECT' as const,
        commissionsWaived: true,
      };
      expect(service.getCommissionRateForLevel(1, customStructure).toString()).toBe('0');
    });
  });

  describe('getNetwork', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      await expect(service.getNetwork(new Types.ObjectId())).rejects.toThrow(NotFoundException);
    });

    it('should return empty network for user without referrals', async () => {
      const user = createMockUser({ directReferrals: [] });
      userModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(user),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.getNetwork(user._id);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getEarnings', () => {
    it('should aggregate and return earnings by level', async () => {
      const userId = new Types.ObjectId();
      const sourceUserId = new Types.ObjectId();

      commissionModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: { sourceUserId, level: 1 },
            totalEarned: { toString: () => '100' },
            claimed: { toString: () => '50' },
            unclaimed: { toString: () => '50' },
          },
        ]),
      });

      const result = await service.getEarnings(userId);

      expect(result.byLevel).toHaveLength(1);
      expect(result.byLevel[0]?.level).toBe(1);
      expect(result.grandTotal).toBe('100');
    });

    it('should return empty result when no commissions exist', async () => {
      const userId = new Types.ObjectId();

      commissionModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getEarnings(userId);

      expect(result.byLevel).toHaveLength(0);
      expect(result.grandTotal).toBe('0');
    });
  });

  describe('getClaimableAmount', () => {
    it('should return claimable commission and cashback amounts', async () => {
      const userId = new Types.ObjectId();
      const user = createMockUser({ totalCashbackEarned: { toString: () => '25.5' } });

      commissionModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ total: { toString: () => '150.75' } }]),
      });
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(user) });

      const result = await service.getClaimableAmount(userId);

      expect(result.commission).toBe('150.75');
      expect(result.cashback).toBe('25.5');
    });

    it('should return zero when no claimable amount', async () => {
      const userId = new Types.ObjectId();

      commissionModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.getClaimableAmount(userId);

      expect(result.commission).toBe('0');
      expect(result.cashback).toBe('0');
    });
  });

  describe('findUserById', () => {
    it('should find user by ObjectId', async () => {
      const user = createMockUser();
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(user) });

      const result = await service.findUserById(user._id);

      expect(result).toEqual(user);
    });

    it('should return null for non-existent user', async () => {
      userModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.findUserById(new Types.ObjectId());

      expect(result).toBeNull();
    });
  });

  describe('findUserByReferralCode', () => {
    it('should find user by referral code', async () => {
      const user = createMockUser();
      userModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(user) });

      const result = await service.findUserByReferralCode('TESTCODE');

      expect(result).toEqual(user);
      expect(userModel.findOne).toHaveBeenCalledWith({ referralCode: 'TESTCODE' });
    });
  });
});
