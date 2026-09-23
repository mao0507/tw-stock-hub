<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth.store'
import { stockApi } from '@tw-stock-hub/api-client'
import type { StockSearchItem } from '@tw-stock-hub/types'
import { UserAvatar } from '@tw-stock-hub/ui'

const router = useRouter()
const authStore = useAuthStore()
const { isLoggedIn, user } = storeToRefs(authStore)

const searchQuery = ref('')
const searchResults = ref<StockSearchItem[]>([])
const showDropdown = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onSearch(q: string): void {
  searchQuery.value = q
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q.trim()) { searchResults.value = []; showDropdown.value = false; return }
  debounceTimer = setTimeout(async () => {
    searchResults.value = await stockApi.searchStocks(q)
    showDropdown.value = searchResults.value.length > 0
  }, 300)
}

function onSearchBlur(): void {
  setTimeout(() => { showDropdown.value = false }, 150)
}

function goToStock(id: string): void {
  showDropdown.value = false
  searchQuery.value = ''
  void router.push({ name: 'stock-detail', params: { id } })
}

const navItems = [
  { name: 'home', label: '大盤', icon: 'M3 13h4v8H3zM10 8h4v13h-4zM17 4h4v17h-4z' },
  { name: 'institutional', label: '法人', icon: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6' },
  { name: 'margin', label: '融資券', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { name: 'brokers', label: '分點', icon: 'M3 3v18h18M7 16l4-6 4 3 5-7' },
  { name: 'screener', label: '選股', icon: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35' },
  { name: 'calendar', label: '行事曆', icon: 'M3 9h18M7 3v3M17 3v3M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
  { name: 'watchlist', label: '自選股', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z' },
  { name: 'alerts', label: '警示', icon: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0' },
]
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <aside class="fixed inset-y-0 left-0 z-30 flex w-16 flex-col items-center border-r border-gray-100 bg-white py-4 gap-2 md:w-20">
      <router-link
        to="/"
        class="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-up font-display text-sm font-bold text-white"
      >
        台股
      </router-link>

      <nav class="flex w-full flex-col gap-1 px-2">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center text-[11px] transition-all duration-200 ease-out"
          :class="$route.name === item.name
            ? 'bg-up-soft font-semibold text-up'
            : 'text-gray-500 hover:bg-gray-100'"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><path :d="item.icon" /></svg>
          <span class="hidden md:block">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="mt-auto">
        <router-link
          v-if="isLoggedIn && user"
          to="/watchlist"
        >
          <UserAvatar
            :avatar-url="user.avatarUrl"
            :nickname="user.nickname"
            size="sm"
          />
        </router-link>
        <router-link
          v-else
          to="/login"
          class="text-xs text-gray-400 hover:text-up"
        >
          登入
        </router-link>
      </div>
    </aside>

    <div class="flex flex-1 flex-col pl-16 md:pl-20">
      <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/90 px-4 backdrop-blur">
        <div class="relative flex-1 max-w-sm">
          <svg
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            :value="searchQuery"
            placeholder="搜尋股票代號或名稱…"
            class="input-field w-full pl-9"
            @input="onSearch(($event.target as HTMLInputElement).value)"
            @blur="onSearchBlur"
            @focus="showDropdown = searchResults.length > 0"
          >
          <div
            v-if="showDropdown"
            class="absolute top-full left-0 right-0 mt-1 rounded-xl border border-gray-100 bg-white shadow-soft z-50"
          >
            <button
              v-for="s in searchResults"
              :key="s.id"
              class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
              @click="goToStock(s.id)"
            >
              <span class="font-mono text-sm font-semibold text-gray-700">{{ s.id }}</span>
              <span class="text-sm text-gray-600">{{ s.name }}</span>
              <span class="ml-auto text-xs text-gray-400">{{ s.market }}</span>
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 animate-fade-up p-4 md:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
