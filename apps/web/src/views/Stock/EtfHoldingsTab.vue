<script setup lang="ts">
// ETF 成分股分頁（#40）：最新一期成分、產業分布；台股成分可點進個股頁
import { computed, ref, watch } from 'vue'
import { PieChart, PIE_PALETTE } from '@tw-stock-hub/charts'
import { LoadingSkeleton } from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import type { EtfHoldings } from '@tw-stock-hub/types'
import { useMediaQuery } from '@/composables/useMediaQuery'

const props = defineProps<{ stockId: string }>()

const data = ref<EtfHoldings | null>(null)
const loading = ref(false)
const failed = ref(false)
const showAll = ref(false)
const isDesktop = useMediaQuery('(min-width: 768px)')
const TOP = 10

watch(() => props.stockId, async (id) => {
  loading.value = true
  failed.value = false
  showAll.value = false
  try {
    const res = await stockApi.getEtfHoldings(id)
    if (id === props.stockId) data.value = res
  } catch (e) {
    console.warn('[EtfHoldings] load failed', e)
    if (id === props.stockId) failed.value = true
  } finally {
    loading.value = false
  }
}, { immediate: true })

const holdings = computed(() => data.value?.holdings ?? [])
const visible = computed(() => (showAll.value ? holdings.value : holdings.value.slice(0, TOP)))
const maxWeight = computed(() => holdings.value[0]?.weight || 1)
const industries = computed(() => data.value?.industries ?? [])
const industryPie = computed(() => {
  const list = industries.value
  if (list.length <= 9) return list.map(i => ({ name: i.sector, value: i.weight }))
  const rest = list.slice(8).reduce((s, i) => s + i.weight, 0)
  return [...list.slice(0, 8).map(i => ({ name: i.sector, value: i.weight })), { name: '其餘', value: Math.round(rest * 100) / 100 }]
})
const color = (i: number) => PIE_PALETTE[i % PIE_PALETTE.length]!
const pct = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)
const SOURCE: Record<string, string> = { moneydj: 'MoneyDJ' }
</script>

<template>
  <LoadingSkeleton
    v-if="loading && !data"
    type="table"
    :rows="8"
  />
  <p
    v-else-if="failed"
    role="alert"
    class="fund-empty"
  >
    成分資料載入失敗，請稍後再試
  </p>
  <div
    v-else-if="data"
    class="space-y-5"
  >
    <div
      v-if="data.info?.length"
      class="fund-sec"
    >
      <div class="fund-hd">
        基本資料
      </div>
      <div class="info-grid">
        <div
          v-for="[k, v] in data.info"
          :key="k"
          class="info-cell"
        >
          <span class="info-k">{{ k }}</span>
          <a
            v-if="/^https?:/.test(v)"
            :href="v"
            target="_blank"
            rel="noopener"
            class="info-v info-link"
          >{{ v }}</a>
          <span
            v-else
            class="info-v"
          >{{ v }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="industries.length"
      class="fund-sec"
    >
      <div class="fund-hd">
        產業分布
      </div>
      <div class="ind-row">
        <PieChart
          v-if="isDesktop"
          :data="industryPie"
          :height="240"
        />
        <ul class="ind-list">
          <li
            v-for="(ind, i) in industries"
            :key="ind.sector"
            class="ind-item"
          >
            <span
              class="ind-dot"
              :style="{ background: color(i) }"
            />
            <span class="ind-name">{{ ind.sector }}</span>
            <span
              v-if="!isDesktop"
              class="ind-bar"
            ><span :style="{ width: `${Math.min(100, ind.weight)}%`, background: color(i) }" /></span>
            <span class="ind-w num">{{ ind.weight.toFixed(2) }}%</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="fund-sec">
      <div class="fund-hd-row">
        <span class="fund-hd">成分與權重</span>
        <span class="fund-hd-side">
          {{ holdings.length }} 檔<template v-if="data.dataDate"> · 資料日 {{ data.dataDate }}</template>
          <template v-if="data.source"> · {{ SOURCE[data.source] ?? data.source }}</template>
        </span>
      </div>
      <div
        v-if="!holdings.length"
        class="fund-empty"
      >
        尚無成分資料
      </div>
      <div
        v-else
        class="scroll-x"
      >
        <table class="fund-table etf-table">
          <thead>
            <tr>
              <th>#</th>
              <th>成分</th>
              <th>權重</th>
              <th class="hidden md:table-cell">
                股數
              </th>
              <th>收盤</th>
              <th>漲跌</th>
              <th class="hidden md:table-cell">
                權重占比
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(h, i) in visible"
              :key="h.name"
            >
              <td class="num">
                {{ i + 1 }}
              </td>
              <td class="etf-name">
                <router-link
                  v-if="h.stockId"
                  :to="{ name: 'stock-detail', params: { id: h.stockId } }"
                  class="etf-link"
                >
                  {{ h.name }}
                </router-link>
                <span v-else>{{ h.name }}</span>
                <span
                  v-if="h.symbol"
                  class="etf-sym num"
                >{{ h.stockId ?? h.symbol }}</span>
              </td>
              <td class="num font-semibold">
                {{ h.weight.toFixed(2) }}%
              </td>
              <td class="num hidden md:table-cell">
                {{ h.shares?.toLocaleString() ?? '—' }}
              </td>
              <td class="num">
                {{ h.close ?? '—' }}
              </td>
              <td
                class="num"
                :class="(h.changePct ?? 0) > 0 ? 'is-up' : (h.changePct ?? 0) < 0 ? 'is-dn' : 'is-flat'"
              >
                {{ pct(h.changePct) || '—' }}
              </td>
              <td class="hidden md:table-cell">
                <div class="etf-bar-track">
                  <div
                    class="etf-bar-fill"
                    :style="{ width: `${Math.min(100, (h.weight / maxWeight) * 100)}%` }"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        v-if="holdings.length > TOP"
        type="button"
        class="mt-2 w-full py-2.5 text-sm text-ink hover:bg-gray-50"
        @click="showAll = !showAll"
      >
        {{ showAll ? `只看前 ${TOP} 大` : `顯示全部 ${holdings.length} 檔` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.info-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
@media (min-width: 768px) { .info-grid { grid-template-columns: 1fr 1fr; column-gap: 1.5rem; } }
.info-cell { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.5rem; align-items: start; padding: 0.55rem 0; border-bottom: 1px solid var(--bd-soft); }
.info-k { font-size: 0.78rem; color: var(--muted); }
.info-v { font-size: 0.82rem; color: var(--txt); word-break: break-all; }
.info-link { color: var(--ink); text-decoration: none; }
.info-link:hover { text-decoration: underline; }
.ind-row { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 768px) { .ind-row { grid-template-columns: 1fr 1fr; align-items: center; } }
.ind-list { display: flex; flex-direction: column; gap: 0.1rem; max-height: 280px; overflow-y: auto; }
.ind-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.2rem; border-bottom: 1px solid var(--bd-soft); font-size: 0.82rem; }
.ind-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.ind-name { color: var(--txt); white-space: nowrap; }
.ind-bar { flex: 1; height: 0.45rem; background: var(--bg); border-radius: 999px; overflow: hidden; }
.ind-bar > span { display: block; height: 100%; border-radius: 999px; }
.ind-w { margin-left: auto; font-weight: 600; color: var(--txt); }
.etf-table td { padding: 0.45rem 0.5rem; }
.etf-table th:nth-child(1), .etf-table td:nth-child(1) { width: 2.5rem; text-align: center; color: var(--muted); }
.etf-table th:nth-child(2), .etf-table td:nth-child(2) { text-align: left; }
.etf-table th:last-child, .etf-table td:last-child { text-align: left; width: 28%; }
.etf-name { min-width: 8rem; }
.etf-link { color: var(--txt); font-weight: 600; text-decoration: none; }
.etf-link:hover { color: var(--ink); text-decoration: underline; }
.etf-sym { color: var(--muted); font-size: 0.66rem; margin-left: 0.35rem; }
.etf-bar-track { height: 0.5rem; background: var(--bg); border-radius: 999px; overflow: hidden; min-width: 80px; }
.etf-bar-fill { height: 100%; background: var(--ink); opacity: 0.75; border-radius: 999px; }
</style>
