<script setup lang="ts">
// 技術指標摘要（#19）與 RS 相對強弱（#20）：後端每日預算的最新值與趨勢判斷
import { computed, ref, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { StockIndicators } from '@tw-stock-hub/types'

const props = defineProps<{ stockId: string }>()

const data = ref<StockIndicators | null>(null)
const failed = ref(false)

watch(() => props.stockId, async (id) => {
  data.value = null
  failed.value = false
  try {
    const res = await stockApi.getIndicators(id, 21)
    if (id === props.stockId) data.value = res // 快速切換股票時丟棄舊回應
  } catch (e) {
    console.warn('[TechnicalSummary] load failed', e)
    if (id === props.stockId) failed.value = true
  }
}, { immediate: true })

const latest = computed(() => data.value?.latest ?? null)

const mas = computed(() => {
  const l = latest.value
  if (!l) return []
  return ([['MA5', l.ma5], ['MA10', l.ma10], ['MA20', l.ma20], ['MA60', l.ma60], ['MA120', l.ma120], ['MA240', l.ma240]] as const)
    .map(([label, v]) => ({ label, v, above: v == null ? null : l.close > v }))
})

// RS 與 20 個交易日前比較
const rs = computed(() => {
  const s = data.value?.series ?? []
  const now = s.at(-1)?.rsScore ?? null
  const before = s.length > 20 ? s[0]!.rsScore : null
  return { now, delta: now != null && before != null ? now - before : null }
})
const rsNote = computed(() => {
  const v = rs.value.now
  if (v == null) return '歷史不足 250 日'
  return v >= 80 ? '強於八成個股' : v <= 20 ? '弱於八成個股' : '居中'
})

const rsiNote = computed(() => {
  const v = latest.value?.rsi14
  if (v == null) return ''
  return v >= 70 ? '超買區' : v <= 30 ? '超賣區' : '中性'
})
const kdNote = computed(() => {
  const l = latest.value
  if (l?.k9 == null || l.d9 == null) return ''
  return l.k9 > l.d9 ? 'K 在 D 之上' : 'K 在 D 之下'
})
const macdNote = computed(() => {
  const h = latest.value?.macdHist
  if (h == null) return ''
  return h > 0 ? '柱狀體翻紅（多方）' : '柱狀體翻綠（空方）'
})
const fmt = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
</script>

<template>
  <section class="panel">
    <div class="panel-hd">
      <h3 class="panel-title">
        指標摘要
      </h3>
      <span
        v-if="latest"
        class="panel-tag"
      >{{ latest.date }} 盤後</span>
    </div>
    <div
      v-if="failed"
      class="p-5 text-sm text-gray-500"
    >
      指標載入失敗
    </div>
    <div
      v-else-if="data && !latest"
      class="p-5 text-sm text-gray-500"
    >
      尚無技術指標資料
    </div>
    <div
      v-else-if="latest"
      class="space-y-4 p-5"
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div class="text-xs text-gray-500">
            RS 相對強弱（全市場百分位）
          </div>
          <div class="flex items-baseline gap-2">
            <span
              class="font-mono text-3xl font-semibold"
              :class="rs.now == null ? 'text-gray-400' : rs.now >= 50 ? 'is-up' : 'is-dn'"
            >{{ rs.now ?? '—' }}</span>
            <span
              v-if="rs.delta != null"
              class="font-mono text-sm"
              :class="rs.delta > 0 ? 'is-up' : rs.delta < 0 ? 'is-dn' : 'is-flat'"
            >{{ rs.delta > 0 ? '▲' : rs.delta < 0 ? '▼' : '' }}{{ Math.abs(rs.delta) }}（20 日）</span>
          </div>
          <div class="text-xs text-gray-500">
            {{ rsNote }}
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <span :class="['badge', latest.bullishAlignment ? 'badge-up' : 'bg-gray-100 text-gray-500']">
          {{ latest.bullishAlignment ? '均線多頭排列' : '非多頭排列' }}
        </span>
        <span
          v-if="latest.aboveMa20 != null"
          :class="['badge', latest.aboveMa20 ? 'badge-up' : 'badge-down']"
        >{{ latest.aboveMa20 ? '站上' : '跌破' }} MA20</span>
        <span
          v-if="latest.aboveMa60 != null"
          :class="['badge', latest.aboveMa60 ? 'badge-up' : 'badge-down']"
        >{{ latest.aboveMa60 ? '站上' : '跌破' }} MA60</span>
      </div>

      <dl class="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <div
          v-for="m in mas"
          :key="m.label"
          class="stat-cell"
        >
          <dt class="stat-k">
            {{ m.label }}
          </dt>
          <dd
            class="stat-v"
            :class="m.above == null ? '' : m.above ? 'is-up' : 'is-dn'"
          >
            {{ fmt(m.v) }}
          </dd>
        </div>
      </dl>

      <dl class="grid grid-cols-1 gap-3 border-t border-paper-line pt-4 sm:grid-cols-3">
        <div class="stat-cell">
          <dt class="stat-k">
            RSI(14)
          </dt>
          <dd class="stat-v">
            {{ fmt(latest.rsi14) }} <span class="text-xs text-gray-500">{{ rsiNote }}</span>
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            KD(9)
          </dt>
          <dd class="stat-v">
            {{ fmt(latest.k9) }} / {{ fmt(latest.d9) }} <span class="text-xs text-gray-500">{{ kdNote }}</span>
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            MACD
          </dt>
          <dd class="stat-v">
            {{ fmt(latest.dif) }} / {{ fmt(latest.dea) }} <span class="text-xs text-gray-500">{{ macdNote }}</span>
          </dd>
        </div>
      </dl>
      <p class="text-xs text-gray-500">
        收盤 {{ fmt(latest.close) }}；均線以紅色表示收盤在其之上。5 日均量 {{ fmt(latest.volMa5) }} 股。
      </p>
    </div>
  </section>
</template>
