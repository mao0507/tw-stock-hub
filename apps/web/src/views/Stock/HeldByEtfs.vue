<script setup lang="ts">
// 持有本股的 ETF（#42）：各 ETF 最新一期的權重；沒有 ETF 持有時不顯示
import { computed, ref, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { HeldByEtf } from '@tw-stock-hub/types'

const props = defineProps<{ stockId: string }>()

const list = ref<HeldByEtf[]>([])
const showAll = ref(false)
const TOP = 8

watch(() => props.stockId, async (id) => {
  showAll.value = false
  try {
    const res = await stockApi.getHeldByEtfs(id)
    if (id === props.stockId) list.value = res
  } catch (e) {
    console.warn('[HeldByEtfs] load failed', e)
    if (id === props.stockId) list.value = []
  }
}, { immediate: true })

const visible = computed(() => (showAll.value ? list.value : list.value.slice(0, TOP)))
const max = computed(() => list.value[0]?.weight || 1)
</script>

<template>
  <div
    v-if="list.length"
    class="panel"
  >
    <div class="panel-hd">
      <span class="panel-title">持有本股的 ETF<span class="ml-1.5 text-xs font-normal text-gray-400">{{ list.length }} 檔</span></span>
    </div>
    <ul class="grid grid-cols-1 gap-x-6 px-4 py-2 md:grid-cols-2">
      <li
        v-for="e in visible"
        :key="e.etfId"
      >
        <router-link
          :to="{ name: 'stock-detail', params: { id: e.etfId } }"
          class="flex min-h-[44px] items-center gap-2 border-b border-paper-line hover:bg-gray-50"
        >
          <span class="truncate text-sm font-medium text-gray-900">{{ e.etfName }}</span>
          <span class="font-mono text-xs text-gray-500">{{ e.etfId }}</span>
          <span class="ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
            <span
              class="block h-full rounded-full bg-ink/70"
              :style="{ width: `${(e.weight / max) * 100}%` }"
            />
          </span>
          <span class="w-14 text-right font-mono text-sm text-gray-900">{{ e.weight.toFixed(2) }}%</span>
        </router-link>
      </li>
    </ul>
    <button
      v-if="list.length > TOP"
      type="button"
      class="w-full border-t border-paper-line py-2.5 text-sm text-ink hover:bg-gray-50"
      @click="showAll = !showAll"
    >
      {{ showAll ? '收合' : `顯示全部 ${list.length} 檔` }}
    </button>
    <p class="border-t border-paper-line px-4 py-2 text-xs text-gray-500">
      權重取各 ETF 最新一期成分資料
    </p>
  </div>
</template>
