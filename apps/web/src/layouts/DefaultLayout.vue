<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth.store'
import { UserAvatar } from '@tw-stock-hub/ui'
import StockSearch from './StockSearch.vue'
import NotificationBell from './NotificationBell.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { isLoggedIn, user } = storeToRefs(authStore)

const moreOpen = ref(false)
const moreMenu = ref<HTMLElement>()
watch(() => route.fullPath, () => { moreOpen.value = false })
// 開啟時焦點移入選單；Esc 關閉
watch(moreOpen, async (open) => {
  if (!open) return
  await nextTick()
  moreMenu.value?.querySelector<HTMLElement>('a, button')?.focus()
})
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') moreOpen.value = false }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

async function onLogout(): Promise<void> {
  moreOpen.value = false
  await authStore.logout()
  await router.push({ name: 'login' })
}

const ICONS = {
  market: 'M4 19h16M6 15l4-5 3 3 5-7',
  portfolio: 'M3 7h18v13H3zM3 11h18M8 7V5h8v2',
  watchlist: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  institutional: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6',
  margin: 'M12 3v18M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  screener: 'M4 5h16l-6 7v6l-4 2v-8z',
  brokers: 'M4 21V10l8-6 8 6v11M9 21v-5h6v5M4 13h16',
  alerts: 'M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}

const navItems = [
  { name: 'home', label: '今日市場', short: '市場', icon: ICONS.market },
  { name: 'portfolio', label: '我的持股', short: '持股', icon: ICONS.portfolio },
  { name: 'watchlist', label: '自選股', short: '自選', icon: ICONS.watchlist },
  { name: 'calendar', label: '除權息行事曆', short: '行事曆', icon: ICONS.calendar },
  { name: 'institutional', label: '法人動向', short: '法人', icon: ICONS.institutional },
  { name: 'margin', label: '融資融券', short: '融資券', icon: ICONS.margin },
  { name: 'screener', label: '選股器', short: '選股', icon: ICONS.screener },
  { name: 'brokers', label: '分點動向', short: '分點', icon: ICONS.brokers },
  { name: 'alerts', label: '盤後提醒', short: '提醒', icon: ICONS.alerts },
]
// 手機底部列放前四項，其餘收進「更多」
const bottomItems = navItems.slice(0, 4)
const moreItems = navItems.slice(4)

const isActive = (name: string) => route.name === name
const moreActive = computed(() => moreItems.some((i) => i.name === route.name))
</script>

<template>
  <div class="min-h-screen bg-paper text-gray-900 lg:flex">
    <!-- 桌機側欄 -->
    <nav
      aria-label="主選單"
      class="sticky top-0 hidden h-screen w-[232px] flex-shrink-0 flex-col gap-8 border-r border-paper-line px-6 py-8 lg:flex"
    >
      <router-link
        to="/"
        class="flex flex-col gap-0.5 no-underline"
      >
        <span class="font-display text-[26px] font-extrabold tracking-wide text-ink">存股帳本</span>
        <span class="font-mono text-[11px] tracking-[0.18em] text-gray-500">TW STOCK HUB</span>
      </router-link>

      <ul class="flex flex-col gap-1 text-[15px]">
        <li
          v-for="item in navItems"
          :key="item.name"
        >
          <router-link
            :to="{ name: item.name }"
            :aria-current="isActive(item.name) ? 'page' : undefined"
            class="flex min-h-[42px] items-center gap-3 rounded-lg px-3 transition-colors"
            :class="isActive(item.name) ? 'bg-ink font-medium text-paper' : 'text-gray-800 hover:bg-gray-100'"
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
            {{ item.label }}
          </router-link>
        </li>
      </ul>

      <div class="mt-auto border-t border-paper-line pt-5">
        <div
          v-if="isLoggedIn && user"
          class="flex items-center gap-3"
        >
          <UserAvatar
            :avatar-url="user.avatarUrl"
            :nickname="user.nickname"
            size="sm"
          />
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium text-gray-900">{{ user.nickname }}</span>
            <button
              type="button"
              class="self-start text-xs text-gray-500 hover:text-ink"
              @click="onLogout"
            >
              登出
            </button>
          </div>
        </div>
        <router-link
          v-else
          to="/login"
          class="btn-primary w-full"
        >
          登入
        </router-link>
      </div>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col pb-[72px] lg:pb-0">
      <!-- 頂部：手機顯示品牌；桌機只放搜尋 -->
      <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-paper-line bg-paper/95 px-4 py-3 backdrop-blur lg:px-12">
        <router-link
          to="/"
          class="whitespace-nowrap font-display text-xl font-extrabold text-ink lg:hidden"
        >
          存股帳本
        </router-link>
        <div class="ml-auto flex w-full max-w-[420px] items-center gap-2">
          <div class="min-w-0 flex-1">
            <StockSearch />
          </div>
          <NotificationBell v-if="isLoggedIn" />
        </div>
      </header>

      <main class="mx-auto w-full max-w-[1400px] flex-1 animate-fade-up px-4 py-6 lg:px-12 lg:py-9">
        <RouterView />
      </main>
    </div>

    <!-- 手機底部導覽 -->
    <nav
      aria-label="主選單"
      class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-paper-line bg-paper-surface lg:hidden"
    >
      <router-link
        v-for="item in bottomItems"
        :key="item.name"
        :to="{ name: item.name }"
        :aria-current="isActive(item.name) ? 'page' : undefined"
        class="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px]"
        :class="isActive(item.name) ? 'font-bold text-ink' : 'text-gray-500'"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        ><path :d="item.icon" /></svg>
        {{ item.short }}
      </router-link>
      <button
        type="button"
        :aria-expanded="moreOpen"
        aria-controls="more-menu"
        class="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px]"
        :class="moreActive || moreOpen ? 'font-bold text-ink' : 'text-gray-500'"
        @click="moreOpen = !moreOpen"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          aria-hidden="true"
        ><path :d="ICONS.more" /></svg>
        更多
      </button>
    </nav>

    <!-- 手機「更多」選單 -->
    <div
      v-if="moreOpen"
      class="fixed inset-0 z-30 bg-gray-900/30 lg:hidden"
      @click="moreOpen = false"
    />
    <div
      v-if="moreOpen"
      id="more-menu"
      ref="moreMenu"
      class="fixed inset-x-3 bottom-[72px] z-40 rounded-2xl border border-paper-line bg-paper-surface p-2 shadow-lg lg:hidden"
    >
      <router-link
        v-for="item in moreItems"
        :key="item.name"
        :to="{ name: item.name }"
        :aria-current="isActive(item.name) ? 'page' : undefined"
        class="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] text-gray-900 hover:bg-gray-100"
      >
        <svg
          class="h-5 w-5 text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        ><path :d="item.icon" /></svg>
        {{ item.label }}
      </router-link>
      <div class="my-1 border-t border-paper-line" />
      <button
        v-if="isLoggedIn"
        type="button"
        class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-gray-700 hover:bg-gray-100"
        @click="onLogout"
      >
        登出{{ user ? `（${user.nickname}）` : '' }}
      </button>
      <router-link
        v-else
        to="/login"
        class="flex min-h-[48px] items-center rounded-xl px-3 text-[15px] font-bold text-ink hover:bg-gray-100"
      >
        登入
      </router-link>
    </div>
  </div>
</template>
