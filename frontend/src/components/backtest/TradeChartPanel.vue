<template>
  <div class="card mb-6">
    <div class="card-body">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Gráfico del trade
          <span v-if="selectedTrade" class="text-gray-500 dark:text-gray-400 font-medium">
            {{ selectedTrade.symbol }}
            <span :class="selectedTrade.direction === 'long' ? 'text-success' : 'text-danger'">
              {{ selectedTrade.direction === 'long' ? 'LONG' : 'SHORT' }}
            </span>
          </span>
        </h2>
        <span v-if="selectedTrade" class="text-xs font-mono text-gray-500 dark:text-gray-400">
          {{ formatDate(selectedTrade.close_time) }} UTC · {{ selectedTrade.duration_min }}min
        </span>
      </div>

      <div v-if="!supported" class="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
        Símbolo no soportado para gráfico de referencia ({{ binanceSymbol || '—' }}).
      </div>
      <div v-else-if="loading" class="flex justify-center py-16">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
      <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400 py-8 text-center">{{ error }}</div>
      <ReplayChart
        v-else-if="candles.length"
        :candles="candles"
        :executed-fills="fills"
        :cursor="candles.length - 1"
        :trade="chartTrade"
        :height="400"
        :indicators="{ vwap: true, ema9: false, ema20: false, volume: true }"
      />

      <div class="mt-4">
        <input
          type="range"
          min="0"
          :max="trades.length - 1"
          v-model.number="selectedIndex"
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>{{ trades.length ? formatDate(trades[0].close_time) : '' }}</span>
          <span>Trade {{ selectedIndex + 1 }} / {{ trades.length }} — arrastrá para moverte en el tiempo</span>
          <span>{{ trades.length ? formatDate(trades[trades.length - 1].close_time) : '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import ReplayChart from '@/components/replay/ReplayChart.vue'
import api from '@/services/api'
import { parseUtcEpochSeconds, formatUtc } from '@/utils/backtestTime'

// Ventana de referencia de velas alrededor del trade seleccionado — 1m,
// mismo dato real que usa el Backtest Sandbox (Binance público). Padding
// de 30 velas antes de la entrada y después del cierre para dar contexto
// de estructura (FVG/ChoCh) al momento del setup, no solo el trade en sí.
const PAD_MINUTES = 30
const SUPPORTED = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'ATOM-USDT', 'XRP-USDT']

const props = defineProps({
  trades: { type: Array, required: true } // más reciente al final (mismo orden que las tablas)
})

const selectedIndex = ref(Math.max(0, props.trades.length - 1))
const candles = ref([])
const loading = ref(false)
const error = ref(null)

const selectedTrade = computed(() => props.trades[selectedIndex.value] || null)

// Nautilus reporta el símbolo como "SOL-USDT-SWAP.OKX"; bot_trading ya usa
// "SOL-USDT" directo. Normalizar al par que usa Binance público.
function normalizeSymbol(raw) {
  if (!raw) return ''
  const match = /^([A-Z]+-USDT)/.exec(String(raw).toUpperCase())
  return match ? match[1] : String(raw).toUpperCase()
}

const binanceSymbol = computed(() => selectedTrade.value ? normalizeSymbol(selectedTrade.value.symbol) : '')
const supported = computed(() => SUPPORTED.includes(binanceSymbol.value))

const toEpochSeconds = parseUtcEpochSeconds

// nautilus reporta exit_price real; bot_trading solo reporta el resultado
// en R (unidades de riesgo) — usar el TP1/SL como fallback ingenuo mostraba
// un marcador de salida en el TP aunque el trade en realidad cerró en el
// SL (o viceversa). Reconstruir el precio real desde R × distancia de
// riesgo (entry-sl) es exacto para el modelo de contabilidad de R del
// backtest, a diferencia de asumir siempre el mismo nivel.
function resolveExitPrice(trade, isLong) {
  if (trade.exit_price != null) return trade.exit_price
  if (trade.r != null && trade.stop_loss != null && trade.entry_price != null) {
    const riskDist = Math.abs(trade.entry_price - trade.stop_loss)
    return isLong ? trade.entry_price + trade.r * riskDist : trade.entry_price - trade.r * riskDist
  }
  return trade.take_profit ?? trade.entry_price
}

const chartTrade = computed(() => {
  if (!selectedTrade.value) return null
  return {
    stop_loss: selectedTrade.value.stop_loss ?? null,
    take_profit: selectedTrade.value.take_profit ?? null
  }
})

const fills = computed(() => {
  if (!selectedTrade.value) return []
  const openTs = toEpochSeconds(selectedTrade.value.open_time)
  const closeTs = toEpochSeconds(selectedTrade.value.close_time)
  if (openTs === null || closeTs === null) return []
  const isLong = selectedTrade.value.direction === 'long'
  const exitPrice = resolveExitPrice(selectedTrade.value, isLong)
  return [
    { time: openTs, action: isLong ? 'buy' : 'sell', quantity: 1, price: selectedTrade.value.entry_price },
    { time: closeTs, action: isLong ? 'sell' : 'buy', quantity: 1, price: exitPrice }
  ]
})

async function loadCandles() {
  if (!selectedTrade.value || !supported.value) {
    candles.value = []
    return
  }
  const openTs = toEpochSeconds(selectedTrade.value.open_time)
  const closeTs = toEpochSeconds(selectedTrade.value.close_time)
  if (openTs === null || closeTs === null) {
    error.value = 'No se pudo interpretar la fecha del trade.'
    return
  }
  loading.value = true
  error.value = null
  try {
    const { data } = await api.get('/crypto/candles', {
      params: {
        symbol: binanceSymbol.value,
        from: openTs - PAD_MINUTES * 60,
        to: closeTs + PAD_MINUTES * 60
      }
    })
    candles.value = data.candles
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudieron cargar las velas.'
    candles.value = []
  } finally {
    loading.value = false
  }
}

const formatDate = formatUtc

watch(selectedIndex, loadCandles)
onMounted(loadCandles)
</script>
