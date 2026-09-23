<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  {
    name: 'dashboard',
    label: '儀表板',
    icon: 'M3 13h4v8H3zM10 8h4v13h-4zM17 4h4v17h-4z',
  },
  {
    name: 'crawler-status',
    label: '爬蟲監控',
    icon: 'M12 2v4M5 5l2.5 2.5M19 5l-2.5 2.5M12 8a6 6 0 100 12 6 6 0 000-12zM12 12v.01M5 19l2-2M19 19l-2-2',
  },
  {
    name: 'data-health',
    label: '資料健康',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    name: 'user-management',
    label: '會員管理',
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  },
]
</script>

<template>
  <div class="flex min-h-screen bg-gray-950 text-white">
    <aside class="flex w-56 flex-shrink-0 flex-col border-r border-white/10 bg-gray-900/60">
      <div class="border-b border-white/10 px-5 py-5">
        <div class="font-display text-base font-bold tracking-tight text-up">
          台股盤後站
        </div>
        <div class="text-[11px] font-medium uppercase tracking-wider text-gray-500">
          Admin Panel
        </div>
      </div>

      <nav class="flex-1 space-y-1 p-3">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          :class="[
            'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
            route.name === item.name
              ? 'bg-white/[0.07] font-medium text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-white',
          ]"
        >
          <span
            v-if="route.name === item.name"
            class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-up"
          />
          <svg
            class="h-[18px] w-[18px] flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><path :d="item.icon" /></svg>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="border-t border-white/10 px-5 py-4 text-[11px] text-gray-600">
        v1.0 · {{ new Date().getFullYear() }}
      </div>
    </aside>

    <main class="flex-1 overflow-auto">
      <header class="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-gray-950/80 px-6 backdrop-blur">
        <h1 class="font-display text-sm font-semibold text-white/80">
          {{ route.meta['title'] ?? 'Admin' }}
        </h1>
        <span class="font-mono text-xs text-gray-500">
          {{ new Date().toLocaleString('zh-TW') }}
        </span>
      </header>

      <div class="animate-fade-up p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>
