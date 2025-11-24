import BigNumber from 'bignumber.js';
import { Chain } from './constants';

export interface CommissionBreakdown {
  level: number;
  userId: string;
  amount: BigNumber;
  rate: BigNumber;
}

export interface FeeDistribution {
  traderId: string;
  totalFee: BigNumber;
  cashback: BigNumber;
  commissions: CommissionBreakdown[];
  treasury: BigNumber;
  chain: Chain;
  token: string; // The tokenIn token (e.g., 'BTC', 'ETH', 'SOL')
}

export interface ReferralChain {
  userId: string;
  level: number;
  referralCode: string;
}

export interface CustomCommissionStructure {
  type: 'KOL_DIRECT' | 'KOL_CUSTOM' | 'WAIVED';
  level1Rate?: BigNumber;
  level2Rate?: BigNumber;
  level3Rate?: BigNumber;
  feesWaived?: boolean;
  commissionsWaived?: boolean;
}

export interface EarningsBreakdown {
  userId: string;
  level: number;
  totalEarned: string;
  claimed: string;
  unclaimed: string;
}

export interface NetworkNode {
  userId: string;
  referralCode: string;
  level: number;
  joinedAt: Date;
  directReferrals?: NetworkNode[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
