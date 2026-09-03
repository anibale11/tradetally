<template>
  <div class="content-wrapper py-8">
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
         alrededor. Sin scroll propio: el iframe crece a la altura real de
         su contenido y scrollea la PÁGINA, igual que el resto del sitio
         (Nautilus/Bot Backtest) — no una caja con scroll interno. -->
    <iframe
      ref="frame"
      :src="auditUrl"
      class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
      style="overflow: hidden;"
      scrolling="no"
      @load="onFrameLoad"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const auditUrl = computed(() => `${api.defaults.baseURL}/nautilus-backtest/audit/${route.params.methodId}`)

const frame = ref(null)
let resizeObserver = null

function resizeToContent() {
  const el = frame.value
  if (!el) return
  try {
    const doc = el.contentDocument
    if (!doc) return
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.body ? doc.body.scrollHeight : 0
    )
    el.style.height = `${height}px`
  } catch (e) {
    // cross-origin (no debería pasar, es same-origin) — dejar la altura como está
  }
}

function onFrameLoad() {
  resizeToContent()
  try {
    const doc = frame.value.contentDocument
    if (doc && window.ResizeObserver) {
      if (resizeObserver) resizeObserver.disconnect()
      resizeObserver = new ResizeObserver(resizeToContent)
      resizeObserver.observe(doc.documentElement)
    }
  } catch (e) {
    // best-effort
  }
}

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
})
</script>
