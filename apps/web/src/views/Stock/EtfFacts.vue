<script setup lang="ts">
// ETF 基本資料卡（#43）：取代個股總覽的估值與體質卡
import { computed, ref, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { EtfProfile } from '@tw-stock-hub/types'
import IconArrowRight from '~icons/lucide/arrow-right'

const props = defineProps<{ stockId: string }>()

const profile = ref<EtfProfile | null>(null)

watch(() => props.stockId, async (id) => {
  profile.value = null
  const p = await stockApi.getEtfProfile(id).catch(() => null)
  if (id === props.stockId) profile.value = p
}, { immediate: true })

const TYPE_LABEL: Record<string, string> = {
  etf_equity: '國內股票型', etf_foreign: '海外', etf_bond: '債券型', etf_leveraged: '槓桿／反向', etf_other: '其他',
}
const fmtAum = (m: number) => (m >= 100 ? `${(m / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} 億` : `${m.toLocaleString()} 百萬`)
const years = (d: string) => Math.floor((Date.now() - Date.parse(d)) / (365.25 * 86_400_000))

const facts = computed(() => {
  const p = profile.value
  if (!p) return []
  const rows: [string, string][] = [
    ['類型', [TYPE_LABEL[p.securityType] ?? p.securityType, p.region].filter(Boolean).join(' · ')],
    ['發行投信', p.issuer ?? '—'],
    ['追蹤指數', p.trackingIndex ?? '—'],
    ['規模', p.aumMillion != null ? `${fmtAum(p.aumMillion)}${p.aumDate ? `（${p.aumDate}）` : ''}` : '—'],
    ['經理費', p.managementFee != null ? `${p.managementFee}%` : '—'],
    ['總管理費用', p.totalExpense != null ? `${p.totalExpense}%（含保管費等）` : '—'],
    ['配息頻率', p.dividendFrequency ?? '—'],
    ['成立日', p.inceptionDate ? `${p.inceptionDate}（${years(p.inceptionDate)} 年）` : '—'],
    ['保管機構', p.custodian ?? '—'],
  ]
  return rows
})
</script>

<template>
  <div class="panel">
    <div class="panel-hd">
      <span class="panel-title">ETF 基本資料</span>
      <a
        v-if="profile?.website"
        :href="profile.website"
        target="_blank"
        rel="noopener"
        class="text-xs text-gray-500 hover:text-ink"
      >官網 <IconArrowRight
        class="inline align-[-2px]"
        aria-hidden="true"
      /></a>
    </div>
    <dl
      v-if="facts.length"
      class="grid grid-cols-1 gap-x-4 px-4 py-2 text-sm"
    >
      <div
        v-for="[k, v] in facts"
        :key="k"
        class="flex gap-3 border-b border-paper-line py-2"
      >
        <dt class="w-20 shrink-0 text-xs text-gray-500">
          {{ k }}
        </dt>
        <dd class="text-gray-900">
          {{ v }}
        </dd>
      </div>
    </dl>
    <p
      v-else
      class="p-4 text-sm text-gray-500"
    >
      尚無基本資料
    </p>
  </div>
</template>
