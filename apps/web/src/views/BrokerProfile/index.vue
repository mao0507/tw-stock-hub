<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import type { BrokerProfile } from '@tw-stock-hub/types'
import { LoadingSkeleton } from '@tw-stock-hub/ui'

const route = useRoute()
const router = useRouter()
const brokerName = computed(() => route.params['name'] as string)

const data = ref<BrokerProfile | null>(null)
const loading = ref(true)

onMounted(load)
watch(brokerName, load)

async function load(): Promise<void> {
  loading.value = true
  data.value = null
  try {
    data.value = await stockApi.getBrokerProfile({ brokerName: brokerName.value })
  } finally {
    loading.value = false
  }
}

function fmtBroker(name: string): string {
  const code = name.slice(0, 4)
  const label = name.slice(4).replace(/[\s　]+/g, '')
  return label ? `${code} ${label}` : name
}

function fmtShares(v: number): string {
  const abs = Math.abs(v)
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(1)}萬張`
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3).toLocaleString()}張`
  return `${sign}${abs.toLocaleString()}股`
}

// 歷史長條相對寬度
const maxHist = computed(() =>
  Math.max(1, ...(data.value?.history ?? []).map(h => Math.abs(h.net))),
)
</script>

<template>
  <div class="space-y-4">
    <button
      class="text-sm text-gray-400 hover:text-up"
      @click="router.back()"
    >
      ← 返回分點總覽
    </button>

    <header class="page-head">
      <div>
        <h1 class="page-head-title">{{ fmtBroker(brokerName) }}</h1>
        <div class="page-head-sub">BROKER&nbsp;PROFILE</div>
      </div>
      <div v-if="data?.date" class="page-head-meta num">最新交易日 {{ data.date.slice(0, 10) }}</div>
    </header>

    <LoadingSkeleton
      v-if="loading"
      type="table"
      :rows="6"
    />

    <template v-else-if="data">
      <!-- 近期淨額趨勢 -->
      <div
        v-if="data.history.length"
        class="card"
      >
        <div class="mb-3 text-sm font-semibold text-gray-700">近期每日淨額（跨追蹤股）</div>
        <div class="space-y-1.5">
          <div
            v-for="h in data.history"
            :key="h.date"
            class="flex items-center gap-2 text-xs"
          >
            <span class="w-20 shrink-0 font-mono text-gray-400">{{ h.date.slice(5, 10) }}</span>
            <div class="flex flex-1 items-center">
              <div class="flex w-1/2 justify-end">
                <div
                  v-if="h.net < 0"
                  class="h-3.5 rounded-l bg-down/70"
                  :style="{ width: `${(Math.abs(h.net) / maxHist) * 100}%` }"
                />
              </div>
              <div class="flex w-1/2">
                <div
                  v-if="h.net > 0"
                  class="h-3.5 rounded-r bg-up/70"
                  :style="{ width: `${(Math.abs(h.net) / maxHist) * 100}%` }"
                />
              </div>
            </div>
            <span
              class="w-20 shrink-0 text-right font-mono"
              :class="h.net >= 0 ? 'text-up' : 'text-down'"
            >{{ fmtShares(h.net) }}</span>
          </div>
        </div>
      </div>

      <!-- 各股進出 -->
      <div class="grid gap-4 md:grid-cols-2">
        <div class="card">
          <div class="mb-3 text-sm font-semibold text-up">買超個股（{{ data.buys.length }}）</div>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="s in data.buys"
                :key="s.stockId"
                class="border-b border-gray-50"
              >
                <td class="py-1.5">
                  <router-link
                    :to="`/stocks/${s.stockId}`"
                    class="text-gray-700 hover:text-up"
                  >{{ s.stockName }}</router-link>
                  <span class="ml-1 font-mono text-xs text-gray-400">{{ s.stockId }}</span>
                </td>
                <td class="py-1.5 text-right font-mono text-up">{{ fmtShares(s.net) }}</td>
              </tr>
              <tr v-if="!data.buys.length">
                <td class="py-3 text-center text-xs text-gray-300">無</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="mb-3 text-sm font-semibold text-down">賣超個股（{{ data.sells.length }}）</div>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="s in data.sells"
                :key="s.stockId"
                class="border-b border-gray-50"
              >
                <td class="py-1.5">
                  <router-link
                    :to="`/stocks/${s.stockId}`"
                    class="text-gray-700 hover:text-up"
                  >{{ s.stockName }}</router-link>
                  <span class="ml-1 font-mono text-xs text-gray-400">{{ s.stockId }}</span>
                </td>
                <td class="py-1.5 text-right font-mono text-down">{{ fmtShares(s.net) }}</td>
              </tr>
              <tr v-if="!data.sells.length">
                <td class="py-3 text-center text-xs text-gray-300">無</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
