<template>
  <div class="content-wrapper py-8">
    <div class="flex items-center gap-3 mb-6">
      <router-link to="/analysis/backtest-bots" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </router-link>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        SMC Sniper — Producción
      </h1>
    </div>

    <div class="card mb-6">
      <div class="card-body">
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Backtest real de <code>smc_sniper_strategy.py</code> (bot_trading, BingX) — descarga
          velas reales (Bybit) y simula el pipeline completo de señales. Puede tardar varios minutos.
          Reportado en unidades R (sin PnL en $ — el script no usa un riesgo fijo en dólares).
        </p>
        <div class="flex items-center gap-3">
          <select v-model="days" class="input w-32" :disabled="running">
            <option :value="14">14 días</option>
            <option :value="30">30 días</option>
            <option :value="90">90 días</option>
          </select>
          <button class="btn btn-primary" :disabled="running" @click="runBacktest">
            {{ running ? 'Corriendo…' : '▶ Ejecutar backtest' }}
          </button>
          <span v-if="statusText" class="text-sm text-gray-500 dark:text-gray-400">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <div v-if="result && result.run_at" class="space-y-6">
      <div class="text-xs font-mono text-gray-500 dark:text-gray-400">
        Corrido {{ new Date(result.run_at).toLocaleString('es-AR') }} · {{ result.days }} días ·
        {{ (result.symbols || []).join(', ') }} · {{ result.scans ?? '—' }} ciclos evaluados
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="card"><div class="card-body text-center">
          <div class="text-xl font-bold font-mono">{{ result.trades_closed ?? 0 }}</div>
          <div class="text-xs text-gray-500">Trades</div>
        </div></div>
        <div class="card"><div class="card-body text-center">
          <div class="text-xl font-bold font-mono">{{ fmt(result.win_rate) }}%</div>
          <div class="text-xs text-gray-500">Win rate</div>
        </div></div>
        <div class="card"><div class="card-body text-center">
          <div class="text-xl font-bold font-mono" :class="rClass(result.r_total)">
            {{ sign(result.r_total) }}{{ fmt(result.r_total, 2) }}R
          </div>
          <div class="text-xs text-gray-500">R total</div>
        </div></div>
        <div class="card"><div class="card-body text-center">
          <div class="text-xl font-bold font-mono">{{ sign(result.expectancy) }}{{ fmt(result.expectancy, 3) }}R</div>
          <div class="text-xs text-gray-500">Expectancy</div>
        </div></div>
        <div class="card"><div class="card-body text-center">
          <div class="text-xl font-bold font-mono">{{ fmt(result.max_dd, 2) }}R</div>
          <div class="text-xs text-gray-500">Max DD</div>
        </div></div>
      </div>

      <div class="card">
        <div class="card-body overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th class="pb-2">Símbolo</th><th class="pb-2">Trades</th>
                <th class="pb-2">Win rate</th><th class="pb-2">R total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in result.by_symbol || []" :key="s.symbol" class="border-t border-gray-100 dark:border-gray-700">
                <td class="py-2 font-medium">{{ s.symbol }}</td>
                <td class="py-2 font-mono">{{ s.trades }}</td>
                <td class="py-2 font-mono">{{ fmt(s.win_rate) }}%</td>
                <td class="py-2 font-mono" :class="rClass(s.r_total)">{{ sign(s.r_total) }}{{ fmt(s.r_total, 2) }}R</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <TradeChartPanel v-if="result.trades && result.trades.length" ref="chartPanel" :trades="result.trades" />

      <div class="card">
        <div class="card-body overflow-x-auto">
          <h2 class="text-lg font-semibold mb-3">Trades (más reciente primero) — click en una fila para verla en el gráfico</h2>
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th class="pb-2">Símbolo</th><th class="pb-2">Dir</th><th class="pb-2">Entrada</th>
                <th class="pb-2">SL</th><th class="pb-2">TP1</th>
                <th class="pb-2">Cierre (UTC)</th><th class="pb-2">Duración</th>
                <th class="pb-2">Score</th><th class="pb-2">R</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(t, i) in reversedTrades"
                :key="i"
                class="border-t border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="showTradeOnChart(i)"
              >
                <td class="py-2 font-medium">{{ t.symbol }}</td>
                <td class="py-2" :class="t.direction === 'long' ? 'text-success' : 'text-danger'">
                  {{ t.direction === 'long' ? 'LONG' : 'SHORT' }}
                </td>
                <td class="py-2 font-mono">{{ fmt(t.entry_price, 4) }}</td>
                <td class="py-2 font-mono">{{ fmt(t.stop_loss, 4) }}</td>
                <td class="py-2 font-mono">{{ fmt(t.take_profit, 4) }}</td>
                <td class="py-2 font-mono">{{ formatUtc(t.close_time) }}</td>
                <td class="py-2 font-mono">{{ fmt(t.duration_min, 0) }}min</td>
                <td class="py-2 font-mono">{{ t.score }}{{ t.is_unicorn ? ' 🦄' : '' }}</td>
                <td class="py-2 font-mono" :class="rClass(t.r)">{{ sign(t.r) }}{{ fmt(t.r, 2) }}R</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <p v-else class="text-sm text-gray-500 dark:text-gray-400">
      Todavía no hay ningún resultado — ejecutá un backtest arriba.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '@/services/api'
import TradeChartPanel from '@/components/backtest/TradeChartPanel.vue'
import { formatUtc } from '@/utils/backtestTime'

const days = ref(90)
const running = ref(false)
const statusText = ref('')
const result = ref(null)
const chartPanel = ref(null)
let pollTimer = null

const reversedTrades = computed(() => [...(result.value?.trades || [])].reverse())

// reversedTrades está invertida respecto a result.trades (que es lo que
// recibe TradeChartPanel) — mapear el índice de la fila clickeada de
// vuelta al índice real en el array original.
function showTradeOnChart(reversedIndex) {
  const total = result.value?.trades?.length || 0
  const originalIndex = total - 1 - reversedIndex
  chartPanel.value?.selectTrade(originalIndex)
  chartPanel.value?.$el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function fmt(n, d = 1) {
  return n === null || n === undefined ? '—' : Number(n).toFixed(d)
}
function sign(n) {
  return n > 0 ? '+' : ''
}
function rClass(n) {
  return n > 0 ? 'text-success' : n < 0 ? 'text-danger' : ''
}

async function loadLast() {
  try {
    const { data } = await api.get('/bot-backtest/last')
    if (data && data.run_at) result.value = data
  } catch (e) {
    // sin resultado todavía
  }
}

async function pollStatus() {
  try {
    const { data } = await api.get('/bot-backtest/status')
    if (data.status === 'pending') {
      statusText.value = 'En cola…'
    } else if (data.status === 'running') {
      statusText.value = 'Corriendo — puede tardar varios minutos…'
    } else if (data.status === 'done') {
      statusText.value = '✅ Completado'
      running.value = false
      clearInterval(pollTimer)
      pollTimer = null
      await loadLast()
    } else if (data.status === 'error') {
      statusText.value = `❌ Error: ${data.error || 'desconocido'}`
      running.value = false
      clearInterval(pollTimer)
      pollTimer = null
    } else {
      running.value = false
      clearInterval(pollTimer)
      pollTimer = null
    }
  } catch (e) {
    // red intermitente
  }
}

async function runBacktest() {
  running.value = true
  statusText.value = 'Solicitando…'
  try {
    await api.post(`/bot-backtest/run?days=${days.value}`)
    statusText.value = 'En cola…'
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(pollStatus, 5000)
  } catch (e) {
    running.value = false
    statusText.value = `❌ ${e.response?.data?.error || 'No se pudo iniciar'}`
  }
}

onMounted(loadLast)
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>
