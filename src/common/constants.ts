import BigNumber from 'bignumber.js';

BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
});

export const COMMISSION_RATES = {
  LEVEL_1: new BigNumber('0.30'), // 30% direct referral
  LEVEL_2: new BigNumber('0.03'), // 3% second level
  LEVEL_3: new BigNumber('0.02'), // 2% third level
} as const;

export const FEE_DISTRIBUTION = {
  CASHBACK_RATE: new BigNumber('0.10'), // 10% cashback to trader
  TOTAL_COMMISSION_RATE: new BigNumber('0.35'), // 35% total commissions
  TREASURY_RATE: new BigNumber('0.55'), // 55% to treasury
} as const;

export const FEE_TIERS = {
  BASE: new BigNumber('0.01'), // 1% base fee tier
  REDUCED: new BigNumber('0.005'), // 0.5% reduced fee tier
} as const;

export const REFERRAL_CODE_LENGTH = 8;
export const MAX_REFERRAL_DEPTH = 3;

export type Chain = 'ARBITRUM' | 'SOLANA';

export const SUPPORTED_CHAINS: Chain[] = ['ARBITRUM', 'SOLANA'];
