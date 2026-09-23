<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { BrokerOverview, BrokerLeaderboard } from '@tw-stock-hub/types'
import { LoadingSkeleton } from '@tw-stock-hub/ui'

const overview = ref<BrokerOverview | null>(null)
const leaderboard = ref<BrokerLeaderboard | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const [o, l] = await Promise.all([
      stockApi.getBrokerOverview(),
      stockApi.getBrokerLeaderboard({ limit: 15 }),
    ])
    overview.value = o
    leaderboard.value = l
  } finally {
    loading.value = false
  }
})

function fmtShares(v: number): string {
  const abs = Math.abs(v)
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(1)}萬張`
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3).toLocaleString()}張`
  return `${sign}${abs.toLocaleString()}股`
}

// BSR 分點名稱為「4 碼券商代號 + 中文名」黏在一起，且名稱含全形 padding 空白。
// 拆成「代號 名稱」並去除內部空白。
function fmtBroker(name: string): string {
  const code = name.slice(0, 4)
  const label = name.slice(4).replace(/[\s　]+/g, '')
  return label ? `${code} ${label}` : name
}
</script>

<template>
  <div class="space-y-4">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">分點總覽</h1>
        <div class="page-head-sub">BROKER&nbsp;FLOW</div>
      </div>
      <div class="page-head-meta">
        主力分點進出 · 每日 18:00 更新
        <span v-if="overview?.date" class="ml-2 num">{{ overview.date.slice(0, 10) }}</span>
      </div>
    </header>

    <LoadingSkeleton
      v-if="loading"
      type="table"
      :rows="8"
    />

    <div
      v-else-if="!overview || !overview.rows.length"
      class="card py-10 text-center text-sm text-gray-400"
    >
      尚無分點資料。分點僅追蹤部分熱門股，資料於每日 18:00 盤後更新。
    </div>

    <template v-else>
      <!-- 主力分點榜（跨股） -->
      <div
        v-if="leaderboard"
        class="grid gap-4 md:grid-cols-2"
      >
        <div class="card">
          <div class="mb-3 text-sm font-semibold text-up">主力買超榜 <span class="text-xs font-normal text-gray-400">（跨追蹤股合計）</span></div>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="(b, i) in leaderboard.topBuy"
                :key="b.brokerName"
                class="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                @click="$router.push({ name: 'broker-profile', params: { name: b.brokerName } })"
              >
                <td class="w-6 py-1.5 text-center text-xs text-gray-400">{{ i + 1 }}</td>
                <td class="py-1.5 text-gray-700 hover:text-up">
                  {{ fmtBroker(b.brokerName) }}
                  <span v-if="b.tag" class="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{{ b.tag }}</span>
                </td>
                <td class="py-1.5 text-center text-xs text-gray-400">{{ b.stockCount }}檔</td>
                <td class="py-1.5 text-right font-mono text-up">{{ fmtShares(b.net) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="mb-3 text-sm font-semibold text-down">主力賣超榜 <span class="text-xs font-normal text-gray-400">（跨追蹤股合計）</span></div>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="(b, i) in leaderboard.topSell"
                :key="b.brokerName"
                class="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                @click="$router.push({ name: 'broker-profile', params: { name: b.brokerName } })"
              >
                <td class="w-6 py-1.5 text-center text-xs text-gray-400">{{ i + 1 }}</td>
                <td class="py-1.5 text-gray-700 hover:text-up">
                  {{ fmtBroker(b.brokerName) }}
                  <span v-if="b.tag" class="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{{ b.tag }}</span>
                </td>
                <td class="py-1.5 text-center text-xs text-gray-400">{{ b.stockCount }}檔</td>
                <td class="py-1.5 text-right font-mono text-down">{{ fmtShares(b.net) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 各股 top3 買賣超分點 -->
      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-400">
              <th class="px-4 py-3 text-left font-medium">股票</th>
              <th class="px-4 py-3 text-left font-medium">買超前 3 分點</th>
              <th class="px-4 py-3 text-left font-medium">賣超前 3 分點</th>
              <th class="px-4 py-3 text-right font-medium">分點數</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in overview.rows"
              :key="row.stockId"
              class="border-b border-gray-50 align-top hover:bg-gray-50"
            >
              <td class="px-4 py-3">
                <router-link
                  :to="`/stocks/${row.stockId}`"
                  class="flex flex-col"
                >
                  <span class="font-medium text-gray-800 hover:text-up">{{ row.stockName }}</span>
                  <span class="font-mono text-xs text-gray-400">{{ row.stockId }}</span>
                </router-link>
              </td>
              <td class="px-4 py-3">
                <div
                  v-for="b in row.topBuy"
                  :key="b.brokerName"
                  class="flex justify-between gap-3 py-0.5"
                >
                  <span class="text-gray-600">{{ fmtBroker(b.brokerName) }}</span>
                  <span class="font-mono text-up">{{ fmtShares(b.net) }}</span>
                </div>
                <span v-if="!row.topBuy.length" class="text-gray-300">—</span>
              </td>
              <td class="px-4 py-3">
                <div
                  v-for="b in row.topSell"
                  :key="b.brokerName"
                  class="flex justify-between gap-3 py-0.5"
                >
                  <span class="text-gray-600">{{ fmtBroker(b.brokerName) }}</span>
                  <span class="font-mono text-down">{{ fmtShares(b.net) }}</span>
                </div>
                <span v-if="!row.topSell.length" class="text-gray-300">—</span>
              </td>
              <td class="px-4 py-3 text-right font-mono text-gray-500">{{ row.brokerCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
