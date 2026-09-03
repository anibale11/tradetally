<template>
  <div class="content-wrapper py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Auditorías de método</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
      Comparación punto por punto entre cada estrategia implementada y el método real de Craig
      Percoco (fuente: NB trading-brain) — una auditoría por método/versión.
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <router-link
        v-for="m in methods"
        :key="m.id"
        :to="`/analysis/method-audits/${m.id}`"
        class="card hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
      >
        <div class="card-body">
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ m.name }}</h2>
            <span
              class="text-xs px-2 py-1 rounded-full"
              :class="m.status === 'live'
                ? 'bg-success/10 text-success'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            >
              {{ m.statusLabel }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ m.source }}</p>
          <p class="text-sm text-primary-600 dark:text-primary-400 mt-3">Ver auditoría completa →</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
// Manifest extensible — a medida que se agreguen métodos nuevos a
// nautilus-trading (hoy solo CraigSMCStrategy), sumar una entrada acá.
// El id se resuelve a la URL real del HTML (servido por el backend de
// TradeTally) dentro de MethodAuditDetailView.vue, embebido en un iframe
// para mantener el sidebar/topbar del shell visibles alrededor.
const methods = [
  {
    id: 'smc-sniper-production',
    name: 'SMC Sniper — Producción',
    status: 'live',
    statusLabel: 'En vivo — BingX',
    source: 'bot_trading — trading-server',
  },
  {
    id: 'smc-sniper-nautilus',
    name: 'SMC Sniper — Nautilus (paralelo)',
    status: 'live',
    statusLabel: 'En vivo — OKX demo',
    source: 'nautilus-trading — CraigSMCStrategy',
  },
]
</script>
