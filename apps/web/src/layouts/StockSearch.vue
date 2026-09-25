<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import type { StockSearchItem } from '@tw-stock-hub/types'

// 股票搜尋（代號或名稱），選取後前往個股頁
const router = useRouter()
const query = ref('')
const results = ref<StockSearchItem[]>([])
const open = ref(false)
const active = ref(-1)
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

function onInput(q: string): void {
  query.value = q
  if (timer) clearTimeout(timer)
  if (!q.trim()) { seq++; results.value = []; open.value = false; return }
  timer = setTimeout(async () => {
    const id = ++seq
    try {
      const data = await stockApi.searchStocks(q.trim())
      if (id !== seq) return
      results.value = data
      active.value = -1
      open.value = data.length > 0
    } catch {
      results.value = []
      open.value = false
    }
  }, 250)
}

function go(id: string): void {
  open.value = false
  query.value = ''
  results.value = []
  void router.push({ name: 'stock-detail', params: { id } })
}

function onKey(e: KeyboardEvent): void {
  if (!open.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, results.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter') {
    const pick = results.value[active.value] ?? results.value[0]
    if (pick) go(pick.id)
  } else if (e.key === 'Escape') open.value = false
}

function onBlur(): void {
  setTimeout(() => { open.value = false }, 150)
}
</script>

<template>
  <div class="relative w-full">
    <label class="flex h-11 items-center gap-2.5 rounded-xl border border-gray-300 bg-paper-surface px-3.5 text-gray-500 focus-within:border-ink">
      <svg
        class="h-4 w-4 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      ><circle
        cx="11"
        cy="11"
        r="7"
      /><path d="M21 21l-4.3-4.3" /></svg>
      <span class="sr-only">搜尋股票</span>
      <input
        :value="query"
        type="search"
        role="combobox"
        :aria-expanded="open"
        aria-controls="stock-search-list"
        :aria-activedescendant="open && active >= 0 ? `stock-opt-${active}` : undefined"
        autocomplete="off"
        placeholder="輸入代號或名稱，例如 2330"
        class="w-full min-w-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        @input="onInput(($event.target as HTMLInputElement).value)"
        @keydown="onKey"
        @focus="open = results.length > 0"
        @blur="onBlur"
      >
    </label>
    <ul
      v-if="open"
      id="stock-search-list"
      role="listbox"
      class="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-paper-surface py-1 shadow-lg"
    >
      <li
        v-for="(s, i) in results"
        :key="s.id"
        :id="`stock-opt-${i}`"
        role="option"
        :aria-selected="i === active"
      >
        <button
          type="button"
          class="flex min-h-[44px] w-full items-center gap-3 px-4 text-left hover:bg-gray-100"
          :class="i === active && 'bg-gray-100'"
          @mousedown.prevent="go(s.id)"
        >
          <span class="font-mono text-sm font-semibold text-gray-700">{{ s.id }}</span>
          <span class="text-sm text-gray-900">{{ s.name }}</span>
          <span class="ml-auto text-xs text-gray-500">{{ s.market === 'TPEX' ? '上櫃' : '上市' }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
