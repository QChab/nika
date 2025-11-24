<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import {
  getUsers,
  createUser,
  registerWithReferral,
  getTrades,
  executeTrade,
  getNetwork,
  getEarnings,
  type User,
  type Trade,
  type NetworkNode,
  type EarningsResponse,
  type TradeResponse,
} from './api';
import TradeSimulator from './components/TradeSimulator.vue';

const users = ref<User[]>([]);
const trades = ref<Trade[]>([]);
const selectedUserId = ref<string>('');
const network = ref<NetworkNode[]>([]);
const earnings = ref<EarningsResponse | null>(null);
const lastTradeResult = ref<TradeResponse | null>(null);

const newUserReferralCode = ref('');

const tradeVolume = ref('1000');
const tradeToken = ref('BTC');
const tradeSide = ref<'BUY' | 'SELL'>('BUY');
const tradeChain = ref<'ARBITRUM' | 'SOLANA'>('ARBITRUM');

const loading = ref(false);
const error = ref('');

const TOKENS = ['BTC', 'ETH', 'SOL', 'ARB'];

const selectedUser = computed(() => users.value.find((u) => u.id === selectedUserId.value));

const usersWithReferrers = computed(() => {
  return users.value.map((user) => {
    const referrer = users.value.find((u) => u.id === user.referrerId);
    return {
      ...user,
      referrerCode: referrer?.referralCode || 'None',
    };
  });
});

async function loadUsers() {
  try {
    const { data } = await getUsers();
    users.value = data;
  } catch (e) {
    error.value = 'Failed to load users';
  }
}

async function loadTrades() {
  try {
    const { data } = await getTrades();
    trades.value = data;
  } catch (e) {
    error.value = 'Failed to load trades';
  }
}

async function loadUserData() {
  if (!selectedUserId.value) {
    network.value = [];
    earnings.value = null;
    return;
  }

  try {
    const [networkRes, earningsRes] = await Promise.all([
      getNetwork(selectedUserId.value),
      getEarnings(selectedUserId.value),
    ]);
    network.value = networkRes.data.data;
    earnings.value = earningsRes.data;
  } catch (e) {
    console.error('Failed to load user data', e);
  }
}

async function handleCreateUser() {
  loading.value = true;
  error.value = '';
  try {
    if (newUserReferralCode.value) {
      await registerWithReferral(newUserReferralCode.value);
    } else {
      await createUser();
    }
    newUserReferralCode.value = '';
    await loadUsers();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || 'Failed to create user';
  } finally {
    loading.value = false;
  }
}

async function handleTrade() {
  if (!selectedUserId.value || !tradeVolume.value) return;
  loading.value = true;
  error.value = '';
  lastTradeResult.value = null;
  try {
    const { data } = await executeTrade({
      userId: selectedUserId.value,
      volume: String(tradeVolume.value),
      token: tradeToken.value,
      side: tradeSide.value,
      chain: tradeChain.value,
    });
    lastTradeResult.value = data;
    await Promise.all([loadTrades(), loadUsers(), loadUserData()]);
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || 'Trade failed';
  } finally {
    loading.value = false;
  }
}

watch(selectedUserId, loadUserData);

async function handleTradeSimulated() {
  await Promise.all([loadUsers(), loadTrades(), loadUserData()]);
}

onMounted(() => {
  loadUsers();
  loadTrades();
});
</script>

<template>
  <div class="container">
    <h1>Referral System</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <!-- User Creation -->
    <section class="card">
      <h2>Create User</h2>
      <div class="form-row">
        <input v-model="newUserReferralCode" placeholder="Referral code (optional)" />
        <button @click="handleCreateUser" :disabled="loading">
          {{ newUserReferralCode ? 'Register with Referral' : 'Create New User' }}
        </button>
      </div>
    </section>

    <!-- User Selection -->
    <section class="card">
      <h2>Select User</h2>
      <select v-model="selectedUserId" class="user-select">
        <option value="">-- Select a user --</option>
        <option v-for="user in users" :key="user.id" :value="user.id">
{{ user.id.slice(-8) }}
        </option>
      </select>

      <div v-if="selectedUser" class="user-info">
        <p><strong>User ID:</strong> {{ selectedUser.id.slice(-8) }}</p>
        <p><strong>Fee Tier:</strong> {{ selectedUser.feeTier }}</p>
        <p>
          <strong>Commissions:</strong>
          <template v-if="Object.keys(selectedUser.commissionsByToken).length">
            <span v-for="token in Object.keys(selectedUser.commissionsByToken).sort()" :key="token" class="token-amount">
              {{ selectedUser.commissionsByToken[token] }} {{ token }}
            </span>
          </template>
          <span v-else>-</span>
        </p>
        <p><strong>Total Cashback:</strong> {{ selectedUser.totalCashbackEarned }}</p>
        <p><strong>Total XP:</strong> {{ selectedUser.totalXpEarned }}</p>
      </div>
    </section>

    <!-- Virtual Trading -->
    <section class="card" v-if="selectedUserId">
      <h2>Virtual Trading</h2>
      <div class="tokens">
        <button
          v-for="token in TOKENS"
          :key="token"
          @click="tradeToken = token"
          :class="{ active: tradeToken === token }"
          class="token-btn"
        >
          {{ token }}
        </button>
      </div>
      <div class="form-row">
        <input v-model="tradeVolume" type="number" placeholder="Volume" />
        <select v-model="tradeSide">
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select v-model="tradeChain">
          <option value="ARBITRUM">Arbitrum</option>
          <option value="SOLANA">Solana</option>
        </select>
        <button @click="handleTrade" :disabled="loading" class="trade-btn">Execute Trade</button>
      </div>

      <div v-if="lastTradeResult" class="trade-result">
        <h3>Last Trade Result</h3>
        <p><strong>Token:</strong> {{ lastTradeResult.token }}</p>
        <p><strong>Total Fee:</strong> {{ lastTradeResult.totalFee }} {{ lastTradeResult.token }}</p>
        <p><strong>Cashback (10%):</strong> {{ lastTradeResult.cashback }} {{ lastTradeResult.token }}</p>
        <div v-if="lastTradeResult.commissions.length">
          <strong>Commissions Distributed:</strong>
          <ul>
            <li v-for="(comm, i) in lastTradeResult.commissions" :key="i">
              Level {{ comm.level }}: {{ comm.amount }} {{ lastTradeResult.token }} ({{ (parseFloat(comm.rate) * 100).toFixed(0) }}%)
            </li>
          </ul>
        </div>
        <p v-else><em>No referral commissions (user has no referrer)</em></p>
      </div>
    </section>

    <!-- Referral Network -->
    <section class="card" v-if="selectedUserId">
      <h2>Referral Network</h2>
      <div v-if="network.length === 0" class="empty">No referrals yet</div>
      <table v-else>
        <thead>
          <tr>
            <th>Level</th>
            <th>User ID</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in network" :key="node.userId">
            <td>{{ node.level }}</td>
            <td>{{ node.userId.slice(-8) }}</td>
            <td>{{ new Date(node.joinedAt).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Earnings -->
    <section class="card" v-if="selectedUserId && earnings">
      <h2>Earnings Breakdown</h2>
      <div class="earnings-summary">
        <div class="stat">
          <span class="label">Total Earned</span>
          <span class="value">{{ earnings.grandTotal }}</span>
        </div>
        <div class="stat">
          <span class="label">Total Cashback</span>
          <span class="value">{{ earnings.totalCashback }}</span>
        </div>
        <div class="stat">
          <span class="label">Total XP</span>
          <span class="value">{{ earnings.totalXp }}</span>
        </div>
      </div>

      <div v-for="level in earnings.byLevel" :key="level.level" class="level-earnings">
        <h4>Level {{ level.level }} (Total: {{ level.levelTotal }})</h4>
        <table v-if="level.earnings.length">
          <thead>
            <tr>
              <th>Referee</th>
              <th>Total Earned</th>
              <th>Claimed</th>
              <th>Unclaimed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in level.earnings" :key="e.userId">
              <td>{{ e.userId.slice(-8) }}</td>
              <td>{{ e.totalEarned }}</td>
              <td>{{ e.claimed }}</td>
              <td>{{ e.unclaimed }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- All Users -->
    <section class="card">
      <h2>All Users</h2>
      <table>
        <thead>
          <tr>
            <th>User ID</th>
            <th>Referral Code</th>
            <th>Referred By</th>
            <th>Referrer Code</th>
            <th>Commissions Earned</th>
            <th>Fee Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in usersWithReferrers" :key="user.id">
            <td>{{ user.id.slice(-8) }}</td>
            <td>{{ user.referralCode }}</td>
            <td>{{ user.referrerId ? user.referrerId.slice(-8) : '-' }}</td>
            <td>{{ user.referrerCode }}</td>
            <td>
              <template v-if="Object.keys(user.commissionsByToken).length">
                <span v-for="token in Object.keys(user.commissionsByToken).sort()" :key="token" class="token-amount">
                  {{ user.commissionsByToken[token] }} {{ token }}
                </span>
              </template>
              <span v-else>-</span>
            </td>
            <td>{{ user.feeTier }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Trade Simulator -->
    <TradeSimulator :users="users" @trade-executed="handleTradeSimulated" />

    <!-- Trade History -->
    <section class="card">
      <h2>Trade History</h2>
      <table v-if="trades.length">
        <thead>
          <tr>
            <th>Date</th>
            <th>User ID</th>
            <th>Token</th>
            <th>Side</th>
            <th>Volume</th>
            <th>Fee</th>
            <th>Commissions</th>
            <th>Chain</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="trade in trades" :key="trade.id">
            <td>{{ new Date(trade.createdAt).toLocaleString() }}</td>
            <td>{{ trade.userId.slice(-8) }}</td>
            <td>{{ trade.token }}</td>
            <td :class="trade.side.toLowerCase()">{{ trade.side }}</td>
            <td>{{ trade.volume }} {{ trade.token }}</td>
            <td>{{ trade.totalFee }} {{ trade.token }}</td>
            <td>{{ trade.totalCommissions }} {{ trade.token }}</td>
            <td>{{ trade.chain }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No trades yet</div>
    </section>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f0f0f;
  color: #e0e0e0;
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

h1 {
  text-align: center;
  color: #00d4aa;
  margin-bottom: 30px;
}

h2 {
  color: #00d4aa;
  margin-top: 0;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
}

.card {
  background: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid #2a2a2a;
}

.error {
  background: #ff4444;
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

input,
select {
  padding: 10px 15px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #252525;
  color: #e0e0e0;
  font-size: 14px;
  flex: 1;
  min-width: 150px;
}

input:focus,
select:focus {
  outline: none;
  border-color: #00d4aa;
}

button {
  padding: 10px 20px;
  background: #00d4aa;
  color: #0f0f0f;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

button:hover:not(:disabled) {
  background: #00b894;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-select {
  width: 100%;
  margin-bottom: 15px;
}

.user-info {
  background: #252525;
  padding: 15px;
  border-radius: 8px;
}

.user-info p {
  margin: 5px 0;
}

.tokens {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.token-btn {
  background: #252525;
  color: #e0e0e0;
  border: 1px solid #333;
}

.token-btn.active {
  background: #00d4aa;
  color: #0f0f0f;
  border-color: #00d4aa;
}

.trade-btn {
  background: #00d4aa;
}

.trade-result {
  margin-top: 20px;
  padding: 15px;
  background: #252525;
  border-radius: 8px;
  border-left: 4px solid #00d4aa;
}

.trade-result h3 {
  margin-top: 0;
  color: #00d4aa;
}

.trade-result ul {
  margin: 10px 0;
  padding-left: 20px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

th,
td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #333;
}

th {
  background: #252525;
  color: #00d4aa;
}

tr:hover {
  background: #252525;
}

.buy {
  color: #00d4aa;
}

.sell {
  color: #ff6b6b;
}

.empty {
  text-align: center;
  color: #666;
  padding: 20px;
}

.earnings-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.stat {
  background: #252525;
  padding: 15px 20px;
  border-radius: 8px;
  flex: 1;
}

.stat .label {
  display: block;
  color: #888;
  font-size: 12px;
  margin-bottom: 5px;
}

.stat .value {
  font-size: 20px;
  font-weight: 600;
  color: #00d4aa;
}

.level-earnings {
  margin-top: 20px;
}

.level-earnings h4 {
  color: #888;
  margin-bottom: 10px;
}

.token-amount {
  display: inline-block;
  background: #252525;
  padding: 2px 8px;
  border-radius: 4px;
  margin-right: 8px;
  font-size: 13px;
}
</style>
