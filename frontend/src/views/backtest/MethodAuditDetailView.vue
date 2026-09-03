<template>
  <div class="content-wrapper py-8 h-full flex flex-col">
    <div class="flex items-center gap-3 mb-4">
      <router-link to="/analysis/method-audits" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </router-link>
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">Auditoría de método</h1>
    </div>

    <!-- El documento en sí trae su propio <style>/paleta (no reusa Tailwind
         de acá) — se embebe en un iframe para no pelear con el CSS del
         shell de TradeTally, manteniendo el sidebar/topbar visibles
         alrededor. -->
    <iframe
      :src="auditUrl"
      class="w-full flex-1 min-h-[75vh] rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const auditUrl = computed(() => `${api.defaults.baseURL}/nautilus-backtest/audit/${route.params.methodId}`)
</script>
