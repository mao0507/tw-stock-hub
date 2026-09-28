<script setup lang="ts">
// ETF 前十大成分與產業摘要（#43），放在 ETF 總覽
import { computed, ref, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { EtfHoldings } from '@tw-stock-hub/types'
import IconArrowRight from '~icons/lucide/arrow-right'

const props = defineProps<{ stockId: string }>()
const emit = defineEmits<{ go: [tab: 'holdings'] }>()

const holdings = ref<EtfHoldings | null>(null)

watch(() => props.stockId, async (id) => {
  holdings.value = null
  const h = await stockApi.getEtfHoldings(id).catch(() => null)
  if (id === props.stockId) holdings.value = h
}, { immediate: true })

const top10 = computed(() => holdings.value?.holdings.slice(0, 10) ?? [])
const topSum = computed(() => top10.value.reduce((s, h) => s + h.weight, 0))
const sectors = computed(() => holdings.value?.industries.slice(0, 5) ?? [])
</script>

<template>
  <div
    v-if="top10.length"
    class="panel"
  >
    <div class="panel-hd">
      <span class="panel-title">前十大成分<span class="ml-1.5 text-xs font-normal text-gray-400">合計 {{ topSum.toFixed(1) }}%</span></span>
      <button
        class="text-xs text-gray-500 hover:text-ink"
        @click="emit('go', 'holdings')"
      >
        成分股 <IconArrowRight
          class="inline align-[-2px]"
          aria-hidden="true"
        />
      </button>
    </div>
    <div class="grid gap-6 p-4 md:grid-cols-[2fr_1fr]">
      <ol class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <li
          v-for="(h, i) in top10"
          :key="h.name"
          class="flex items-center gap-2 border-b border-paper-line py-2 text-sm"
        >
          <span class="w-5 font-mono text-xs text-gray-400">{{ i + 1 }}</span>
          <router-link
            v-if="h.stockId"
            :to="{ name: 'stock-detail', params: { id: h.stockId } }"
            class="truncate font-medium text-gray-900 hover:text-ink"
          >
            {{ h.name }}
          </router-link>
          <span
            v-else
            class="truncate text-gray-900"
          >{{ h.name }}</span>
          <span class="ml-auto font-mono">{{ h.weight.toFixed(2) }}%</span>
        </li>
      </ol>
      <div>
        <div class="mb-2 text-xs font-semibold text-gray-500">
          產業分布
        </div>
        <div
          v-for="s in sectors"
          :key="s.sector"
          class="mb-2 text-sm"
        >
          <div class="flex justify-between">
            <span class="text-gray-700">{{ s.sector }}</span>
            <span class="font-mono">{{ s.weight.toFixed(1) }}%</span>
          </div>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              class="h-full rounded-full bg-ink/70"
              :style="{ width: `${Math.min(100, s.weight)}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
