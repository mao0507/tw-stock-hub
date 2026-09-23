<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '@/stores/admin.store'
import { useStaggerIn, useCountUp } from '@tw-stock-hub/ui'

const adminStore = useAdminStore()
const { services, todayLogs, isLoading } = storeToRefs(adminStore)

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.card, .stat-card')

onMounted(() => {
  void adminStore.checkServices()
  void adminStore.fetchTodayLogs()
})

const todaySummary = computed(() => {
  const success = todayLogs.value.filter(l => l.status === 'success').length
  const failed = todayLogs.value.filter(l => l.status === 'failed').length
  const totalRecords = todayLogs.value.reduce((s, l) => s + (l.recordsCount ?? 0), 0)
  return { success, failed, totalRecords }
})

const successCount = computed(() => todaySummary.value.success)
const failedCount = computed(() => todaySummary.value.failed)
const recordsCount = computed(() => todaySummary.value.totalRecords)
const successDisplay = useCountUp(successCount)
const failedDisplay = useCountUp(failedCount)
const recordsDisplay = useCountUp(recordsCount)

const statusBadge: Record<string, string> = {
  success: 'badge-ok',
  failed: 'badge-error',
  partial: 'badge-pending',
}

const statusLabel: Record<string, string> = {
  success: '成功',
  failed: '失敗',
  partial: '部分',
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-6"
  >
    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        服務狀態
      </h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          v-for="svc in services"
          :key="svc.name"
          class="card"
        >
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm text-gray-300">{{ svc.name }}</span>
            <span :class="['h-2.5 w-2.5 rounded-full', svc.status === 'ok' ? 'bg-down' : 'bg-up']" />
          </div>
          <div :class="['text-lg font-semibold', svc.status === 'ok' ? 'text-down' : 'text-up']">
            {{ svc.status === 'ok' ? '正常運行' : '服務異常' }}
          </div>
          <div
            v-if="svc.latency"
            class="mt-0.5 font-mono text-xs text-gray-500"
          >
            {{ svc.latency }}ms
          </div>
        </div>

        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm text-gray-300">Crawler</span>
            <span :class="['h-2.5 w-2.5 rounded-full', todaySummary.failed > 0 ? 'bg-amber-400' : 'bg-down']" />
          </div>
          <div :class="['text-lg font-semibold', todaySummary.failed > 0 ? 'text-amber-400' : 'text-down']">
            {{ todaySummary.failed > 0 ? `${todaySummary.failed} 筆失敗` : '全部正常' }}
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        今日爬蟲摘要
      </h2>
      <div class="grid grid-cols-3 gap-3">
        <div class="stat-card items-center text-center">
          <span class="stat-label">成功執行</span>
          <span class="stat-value text-down">{{ successDisplay }}</span>
        </div>
        <div class="stat-card items-center text-center">
          <span class="stat-label">執行失敗</span>
          <span :class="['stat-value', todaySummary.failed > 0 ? 'text-up' : 'text-gray-500']">{{ failedDisplay }}</span>
        </div>
        <div class="stat-card items-center text-center">
          <span class="stat-label">寫入筆數</span>
          <span class="stat-value text-brand-blue">{{ recordsDisplay.toLocaleString() }}</span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        今日執行紀錄
      </h2>
      <div
        v-if="isLoading"
        class="text-sm text-gray-500"
      >
        載入中…
      </div>
      <div
        v-else
        class="card overflow-hidden p-0"
      >
        <table class="table-modern">
          <thead>
            <tr>
              <th>爬蟲</th>
              <th>時間</th>
              <th><div class="flex justify-center">狀態</div></th>
              <th><div class="flex justify-end">筆數</div></th>
              <th><div class="flex justify-end">耗時</div></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in todayLogs"
              :key="log.id"
            >
              <td class="font-mono text-xs">{{ log.crawlerName }}</td>
              <td class="font-mono text-xs text-gray-400">
                {{ new Date(log.runAt).toLocaleTimeString('zh-TW') }}
              </td>
              <td>
                <div class="flex justify-center">
                  <span :class="statusBadge[log.status]">{{ statusLabel[log.status] }}</span>
                </div>
              </td>
              <td class="text-right font-mono text-xs">
                {{ log.recordsCount?.toLocaleString() ?? '—' }}
              </td>
              <td class="text-right font-mono text-xs text-gray-400">
                {{ log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '—' }}
              </td>
            </tr>
            <tr v-if="todayLogs.length === 0">
              <td
                colspan="5"
                class="border-b-0 py-8 text-center text-sm text-gray-600"
              >
                今日尚無爬蟲執行紀錄
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
