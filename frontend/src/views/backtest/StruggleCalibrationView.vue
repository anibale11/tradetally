<template>
  <div class="content-wrapper py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Calibración de órdenes límite</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-8">
      Por qué las señales del SMC Sniper no llegan a llenarse — datos reales de producción
      (sincronizados desde el VPS cada 6h). Muestra chica todavía: recomendado juntar 2-3
      semanas antes de sacar conclusiones firmes.
    </p>

    <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</div>
    <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="card p-4">
          <p class="text-xs text-gray-500 dark:text-gray-400">Señales registradas</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ summary.totalSignals }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-gray-500 dark:text-gray-400">Canceladas por rechazo del nivel (struggle)</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ causeCount('struggle_fired') }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-gray-500 dark:text-gray-400">Precio nunca volvió al nivel</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ causeCount('never_neared_level') }}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <div
            v-for="t in summary.trades"
            :key="t.tradeId"
            class="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
          >
            <span
              class="text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap"
              :class="causeBadgeClass(t.cause)"
            >{{ causeLabel(t.cause) }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-900 dark:text-white">
                {{ t.symbol }} · {{ t.direction === 'bullish' ? 'long' : 'short' }}
                <span class="text-gray-400 dark:text-gray-500">#{{ t.tradeId }}</span>
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ t.evaluations }} lecturas · máx. {{ t.maxTouches }} toques · {{ t.durationMinutes }} min hasta el último dato
              </p>
            </div>
            <span class="text-xs font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {{ formatDate(t.firstSeenAt) }}
            </span>
          </div>
          <div v-if="!summary.trades.length" class="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            Todavía no hay datos sincronizados.
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const summary = ref({ totalSignals: 0, causeCounts: {}, trades: [] })
const loading = ref(true)
const error = ref(null)

function causeCount(key) {
  return summary.value.causeCounts?.[key] || 0
}

function causeLabel(cause) {
  return {
    struggle_fired: 'Rechazó el nivel',
    never_neared_level: 'Nunca tocó el nivel',
    touched_not_fired: 'Toques sin disparar'
  }[cause] || cause
}

function causeBadgeClass(cause) {
  return {
    struggle_fired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    never_neared_level: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    touched_not_fired: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }[cause] || 'bg-gray-100 text-gray-700'
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  try {
    const { data } = await api.get('/struggle-calibration/summary')
    summary.value = data
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo cargar la calibración.'
  } finally {
    loading.value = false
  }
})
</script>
