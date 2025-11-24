import axios from 'axios';

// In Docker, Nginx proxies /api to backend
// In development, use localhost:3001 directly
const baseURL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL,
});

export interface User {
  id: string;
  referralCode: string;
  referrerId: string | null;
  feeTier: 'BASE' | 'REDUCED';
  commissionsByToken: Record<string, string>;
  totalCashbackEarned: string;
  totalXpEarned: string;
  createdAt: string;
}

export interface Trade {
  id: string;
  userId: string;
  volume: string;
  token: string;
  totalFee: string;
  cashbackAmount: string;
  treasuryAmount: string;
  totalCommissions: string;
  side: 'BUY' | 'SELL';
  chain: 'ARBITRUM' | 'SOLANA';
  createdAt: string;
}

export interface TradeResponse {
  tradeId: string;
  token: string;
  totalFee: string;
  cashback: string;
  treasury: string;
  commissions: { userId: string; level: number; amount: string; rate: string }[];
}

export interface NetworkNode {
  userId: string;
  referralCode: string;
  level: number;
  joinedAt: string;
}

export interface EarningsResponse {
  byLevel: {
    level: number;
    earnings: {
      userId: string;
      totalEarned: string;
      claimed: string;
      unclaimed: string;
    }[];
    levelTotal: string;
  }[];
  grandTotal: string;
  totalClaimed: string;
  totalUnclaimed: string;
  totalCashback: string;
  totalXp: string;
}

export const getUsers = () => api.get<User[]>('/referral/users');

export const createUser = () => api.post<{ userId: string; referralCode: string }>('/referral/generate', {});

export const registerWithReferral = (referralCode: string) =>
  api.post<{ userId: string; referralCode: string }>('/referral/register', { referralCode });

export const getTrades = () => api.get<Trade[]>('/webhook/trades');

export const executeTrade = (data: {
  userId: string;
  volume: string;
  token: string;
  side: 'BUY' | 'SELL';
  chain: 'ARBITRUM' | 'SOLANA';
}) => api.post<TradeResponse>('/webhook/trade', data);

export const getNetwork = (userId: string) =>
  api.get<{ data: NetworkNode[]; total: number }>('/referral/network', {
    headers: { 'x-user-id': userId },
  });

export const getEarnings = (userId: string) =>
  api.get<EarningsResponse>('/referral/earnings', {
    headers: { 'x-user-id': userId },
  });

export default api;
