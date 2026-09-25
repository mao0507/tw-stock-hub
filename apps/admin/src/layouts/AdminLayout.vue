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
  <div class="min-h-screen bg-paper text-gray-900 lg:flex">
    <!-- 側欄（手機改為頂部橫向捲動列） -->
    <aside class="flex flex-shrink-0 flex-col border-paper-line lg:sticky lg:top-0 lg:h-screen lg:w-[232px] lg:border-r">
      <div class="flex items-baseline gap-3 px-4 pt-4 lg:flex-col lg:gap-0.5 lg:px-6 lg:pt-8">
        <span class="font-display text-xl font-extrabold text-ink lg:text-[26px]">存股帳本</span>
        <span class="font-mono text-[11px] tracking-[0.18em] text-gray-500">ADMIN PANEL</span>
      </div>

      <nav
        aria-label="管理選單"
        class="scroll-x flex gap-1 border-b border-paper-line px-3 py-3 lg:mt-6 lg:flex-1 lg:flex-col lg:border-0 lg:px-6"
      >
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          :aria-current="route.name === item.name ? 'page' : undefined"
          :class="[
            'flex min-h-[42px] flex-shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 text-[15px] transition-colors',
            route.name === item.name
              ? 'bg-ink font-medium text-paper'
              : 'text-gray-800 hover:bg-gray-100',
          ]"
        >
          <svg
            class="h-[18px] w-[18px] flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          ><path :d="item.icon" /></svg>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="hidden border-t border-paper-line px-6 py-4 font-mono text-[11px] text-gray-500 lg:block">
        v1.0 · {{ new Date().getFullYear() }}
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      <div class="mx-auto w-full max-w-[1400px] animate-fade-up px-4 py-6 lg:px-12 lg:py-9">
        <header class="page-head mb-6">
          <div>
            <h1 class="page-head-title">
              {{ route.meta['title'] ?? 'Admin' }}
            </h1>
            <div class="page-head-sub">
              TW STOCK HUB · 管理後台
            </div>
          </div>
          <span class="page-head-meta font-mono">
            {{ new Date().toLocaleString('zh-TW') }}
          </span>
        </header>
        <RouterView />
      </div>
    </main>
  </div>
</template>
