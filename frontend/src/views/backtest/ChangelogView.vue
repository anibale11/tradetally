<template>
  <div class="content-wrapper py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Historial de cambios</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-8">
      Git log real de ambos bots — cada commit que efectivamente se desplegó, no un resumen editado.
    </p>

    <div v-for="repoKey in Object.keys(repos)" :key="repoKey" class="mb-10 last:mb-0">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ repos[repoKey].label || repoKey }}
        </h2>
        <span v-if="repos[repoKey].loading" class="text-xs text-gray-500 dark:text-gray-400">Cargando…</span>
        <span v-else-if="repos[repoKey].error" class="text-xs text-red-600 dark:text-red-400">{{ repos[repoKey].error }}</span>
      </div>

      <div v-if="repos[repoKey].commits.length" class="card">
        <div class="card-body p-0">
          <div
            v-for="c in repos[repoKey].commits"
            :key="c.hash"
            class="flex items-start gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
          >
            <span class="text-xs font-mono text-gray-400 dark:text-gray-500 pt-0.5 whitespace-nowrap">
              {{ formatDate(c.date) }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-900 dark:text-white break-words">{{ c.subject }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ c.author }}</p>
            </div>
            <a
              v-if="repos[repoKey].githubUrl"
              :href="`${repos[repoKey].githubUrl}/commit/${c.hash}`"
              target="_blank"
              rel="noopener"
              class="text-xs font-mono text-primary-600 dark:text-primary-400 hover:underline pt-0.5 whitespace-nowrap"
            >
              {{ c.short_hash }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import api from '@/services/api'

const REPO_KEYS = ['bot-trading', 'nautilus-trading']

const repos = reactive(
  Object.fromEntries(REPO_KEYS.map((k) => [k, { label: '', githubUrl: '', commits: [], loading: true, error: null }]))
)

function formatDate(raw) {
  if (!raw) return '—'
  // git log --pretty=%ai ya viene como "YYYY-MM-DD HH:MM:SS +ZZZZ" — Date lo
  // parsea bien porque SÍ trae offset explícito (a diferencia del bug de
  // timestamps de nautilus encontrado antes en esta sesión).
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

async function loadRepo(key) {
  try {
    const { data } = await api.get(`/changelog/${key}`)
    repos[key].label = data.label
    repos[key].githubUrl = data.github_url
    repos[key].commits = data.commits
  } catch (e) {
    repos[key].error = e.response?.data?.error || 'No se pudo cargar el historial.'
  } finally {
    repos[key].loading = false
  }
}

onMounted(() => {
  REPO_KEYS.forEach(loadRepo)
})
</script>
