<script setup lang="ts">
import { ref } from 'vue';
import { executeTrade, type User, type TradeResponse } from '../api';

const props = defineProps<{
  users: User[];
}>();

const emit = defineEmits<{
  tradeExecuted: [];
}>();

const selectedUserId = ref('');
const token = ref('BTC');
const volume = ref('1000');
const side = ref<'BUY' | 'SELL'>('BUY');
const chain = ref<'ARBITRUM' | 'SOLANA'>('ARBITRUM');
const loading = ref(false);
const error = ref('');
const lastResult = ref<TradeResponse | null>(null);

const TOKENS = ['BTC', 'ETH', 'SOL', 'ARB'];

async function handleSimulateTrade() {
  if (!selectedUserId.value || !volume.value) return;

  loading.value = true;
  error.value = '';
  lastResult.value = null;

  try {
    const { data } = await executeTrade({
      userId: selectedUserId.value,
      volume: String(volume.value),
      token: token.value,
      side: side.value,
      chain: chain.value,
    });
    lastResult.value = data;
    emit('tradeExecuted');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || 'Trade simulation failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="card simulator">
    <h2>Trade Simulator</h2>
    <p class="description">Simulate trades for any user to test commission distribution</p>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="simulator-form">
      <div class="form-group">
        <label>User</label>
        <select v-model="selectedUserId">
          <option value="">-- Select user --</option>
          <option v-for="user in props.users" :key="user.id" :value="user.id">
            {{ user.id.slice(-8) }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Token</label>
        <div class="token-buttons">
          <button
            v-for="t in TOKENS"
            :key="t"
            @click="token = t"
            :class="{ active: token === t }"
            class="token-btn"
            type="button"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label>Volume</label>
        <input v-model="volume" type="number" placeholder="Trade volume" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Side</label>
          <select v-model="side">
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>

        <div class="form-group">
          <label>Chain</label>
          <select v-model="chain">
            <option value="ARBITRUM">Arbitrum</option>
            <option value="SOLANA">Solana</option>
          </select>
        </div>
      </div>

      <button
        @click="handleSimulateTrade"
        :disabled="loading || !selectedUserId || !volume"
        class="simulate-btn"
      >
        {{ loading ? 'Simulating...' : 'Simulate Trade' }}
      </button>
    </div>

    <div v-if="lastResult" class="result">
      <h3>Simulation Result</h3>
      <div class="result-grid">
        <div class="result-item">
          <span class="label">Token</span>
          <span class="value">{{ lastResult.token }}</span>
        </div>
        <div class="result-item">
          <span class="label">Total Fee</span>
          <span class="value">{{ lastResult.totalFee }} {{ lastResult.token }}</span>
        </div>
        <div class="result-item">
          <span class="label">Cashback (10%)</span>
          <span class="value">{{ lastResult.cashback }} {{ lastResult.token }}</span>
        </div>
      </div>

      <div v-if="lastResult.commissions.length" class="commissions">
        <h4>Commissions Distributed</h4>
        <div v-for="(comm, i) in lastResult.commissions" :key="i" class="commission-item">
          Level {{ comm.level }}: {{ comm.amount }} {{ lastResult.token }} ({{ (parseFloat(comm.rate) * 100).toFixed(0) }}%)
        </div>
      </div>
      <p v-else class="no-commissions">No referral commissions (user has no referrer)</p>
    </div>
  </section>
</template>

<style scoped>
.simulator {
  border: 2px solid #00d4aa;
}

.description {
  color: #888;
  margin-bottom: 20px;
}

.simulator-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-group label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
}

.form-row {
  display: flex;
  gap: 15px;
}

.form-row .form-group {
  flex: 1;
}

.token-buttons {
  display: flex;
  gap: 8px;
}

.token-btn {
  padding: 8px 16px;
  background: #252525;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.token-btn.active {
  background: #00d4aa;
  color: #0f0f0f;
  border-color: #00d4aa;
}

.simulate-btn {
  margin-top: 10px;
  padding: 12px 24px;
  background: #00d4aa;
  color: #0f0f0f;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.simulate-btn:hover:not(:disabled) {
  background: #00b894;
}

.simulate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result {
  margin-top: 20px;
  padding: 15px;
  background: #252525;
  border-radius: 8px;
  border-left: 4px solid #00d4aa;
}

.result h3 {
  margin: 0 0 15px 0;
  color: #00d4aa;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 15px;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-item .label {
  color: #888;
  font-size: 12px;
}

.result-item .value {
  color: #00d4aa;
  font-weight: 600;
}

.commissions h4 {
  color: #888;
  margin: 0 0 10px 0;
  font-size: 14px;
}

.commission-item {
  padding: 8px 12px;
  background: #1a1a1a;
  border-radius: 4px;
  margin-bottom: 5px;
}

.no-commissions {
  color: #666;
  font-style: italic;
}

.error {
  background: #ff4444;
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 15px;
}

select, input {
  padding: 10px 15px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #252525;
  color: #e0e0e0;
  font-size: 14px;
  width: 100%;
}

select:focus, input:focus {
  outline: none;
  border-color: #00d4aa;
}
</style>
