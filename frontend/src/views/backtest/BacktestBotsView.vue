<template>
  <div class="content-wrapper py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Backtest de bots</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-8">
      Cada bot puede correr varias estrategias en paralelo — una sección por bot, una tarjeta
      por método, con acceso directo a correr el backtest real y a su auditoría de fidelidad
      contra el método de Craig Percoco.
    </p>

    <div v-for="bot in bots" :key="bot.id" class="mb-10 last:mb-0">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ bot.name }}</h2>
        <span class="text-xs px-2 py-1 rounded-full bg-success/10 text-success">{{ bot.statusLabel }}</span>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div
          v-for="method in bot.methods"
          :key="method.id"
          class="card"
        >
          <div class="card-body">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">{{ method.name }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ method.description }}</p>
            <div class="flex items-center gap-3">
              <router-link :to="method.backtestPath" class="btn-primary text-sm px-3 py-1.5">
                ▶ Ejecutar backtest
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Manifest extensible — cada bot puede sumar métodos nuevos acá sin tocar
// el resto de la página (backtestPath apunta a la vista de backtest real
// de ese método, auditId a su auditoría en /analysis/method-audits/:id).
const bots = [
  {
    id: 'bot-trading',
    name: 'bot_trading (BingX)',
    statusLabel: 'Producción',
    methods: [
      {
        id: 'smc-sniper',
        name: 'SMC Sniper',
        description: 'FVG + ChoCh + zona clave + Fibonacci, sesgo BTC por fuerza relativa.',
        backtestPath: '/analysis/bot-backtest',
        auditId: 'smc-sniper-production',
      },
    ],
  },
  {
    id: 'nautilus-trading',
    name: 'nautilus-trading (OKX, paralelo)',
    statusLabel: 'Demo en vivo',
    methods: [
      {
        id: 'smc-sniper-nautilus',
        name: 'SMC Sniper (CraigSMCStrategy)',
        description: 'Mismo método que bot_trading, portado a Nautilus + OKX.',
        backtestPath: '/analysis/nautilus-backtest',
        auditId: 'smc-sniper-nautilus',
      },
    ],
  },
]
</script>
