<template>
  <div class="content-wrapper py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Auditorías de método</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
      Comparación punto por punto entre cada estrategia implementada y el método real de Craig
      Percoco (fuente: NB trading-brain). Cada tarjeta es una estrategia; los métodos integrados
      dentro de una estrategia (por ejemplo, confluencias de entrada) aparecen como sub-ítems de
      su tarjeta, cada uno con su propia auditoría.
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <div
        v-for="m in topLevel"
        :key="m.id"
        class="card hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
      >
        <div class="card-body">
          <div class="flex items-center justify-between mb-1">
            <router-link
              :to="`/analysis/method-audits/${m.id}`"
              class="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
            >
              {{ m.name }}
            </router-link>
            <span
              class="text-xs px-2 py-1 rounded-full"
              :class="statusClass(m.status)"
            >
              {{ m.statusLabel }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ m.source }}</p>

          <div v-if="childrenOf(m.id).length" class="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Métodos integrados
            </p>
            <ul class="space-y-1">
              <li v-for="c in childrenOf(m.id)" :key="c.id">
                <router-link
                  :to="`/analysis/method-audits/${c.id}`"
                  class="flex items-center justify-between gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  <span>{{ c.name }}</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    :class="statusClass(c.status)"
                  >
                    {{ c.statusLabel }}
                  </span>
                </router-link>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ c.source }}</p>
              </li>
            </ul>
          </div>

          <router-link
            :to="`/analysis/method-audits/${m.id}`"
            class="block text-sm text-primary-600 dark:text-primary-400 mt-3 hover:underline"
          >
            Ver auditoría completa →
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Manifest extensible — a medida que se agreguen estrategias o métodos a
// nautilus-trading, sumar una entrada acá. `partOf` (opcional) = id de la
// estrategia padre: el ítem se muestra como método integrado dentro de ella.
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
    name: 'SMC Sniper — Nautilus (beta)',
    status: 'live',
    statusLabel: 'En vivo — OKX demo',
    source: 'nautilus-trading — CraigSMCStrategy',
  },
  {
    id: 'dca-range-trading',
    name: 'DCA Range Trading (Craig Percoco)',
    status: 'evaluated',
    statusLabel: 'En vivo — subcuenta OKX demo',
    source: 'Estrategia independiente de Craig — nautilus-trading',
  },
  {
    id: '35a-elliott-wave',
    name: '35A / Elliott Wave (Craig Percoco)',
    status: 'evaluated',
    statusLabel: 'No implementado — evaluado',
    source: 'Método aparte de Craig — solo investigación',
  },
  {
    id: 'rsi-cloud-entry',
    partOf: 'smc-sniper-nautilus',
    name: 'RSI Cloud — confluencia de entrada',
    status: 'evaluated',
    statusLabel: 'Método del Sniper — en backtest',
    source: 'rsi_cloud_entry (off | replace | gate)',
  },
]

// Primer nivel = estrategias (sin partOf). Los ítems con partOf son métodos
// integrados en la estrategia padre y se listan dentro de su tarjeta.
const topLevel = methods.filter((m) => !m.partOf)
const childrenOf = (id) => methods.filter((m) => m.partOf === id)
const statusClass = (status) => (status === 'live'
  ? 'bg-success/10 text-success'
  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')
</script>
