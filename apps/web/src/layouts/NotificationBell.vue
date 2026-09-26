<script setup lang="ts">
// 站內通知中心（#26）：顯示未讀數，展開看最近通知並標記已讀
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { alertsApi } from '@tw-stock-hub/api-client'
import type { NotificationList } from '@tw-stock-hub/types'

const POLL_MS = 5 * 60_000 // 盤後才會有新通知，5 分鐘輪詢一次足夠

const data = ref<NotificationList>({ unreadCount: 0, items: [] })
const open = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

async function load(): Promise<void> {
  try {
    data.value = await alertsApi.getNotifications()
  } catch (e) {
    console.warn('[NotificationBell] load failed', e)
  }
}

async function markAll(): Promise<void> {
  await alertsApi.markRead()
  await load()
}

async function toggle(): Promise<void> {
  open.value = !open.value
  if (open.value) await load()
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }
onMounted(() => {
  void load()
  timer = setInterval(() => { void load() }, POLL_MS)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKey)
})

const fmtTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-paper-surface text-gray-700 hover:text-ink"
      :aria-label="`通知${data.unreadCount ? `（${data.unreadCount} 則未讀）` : ''}`"
      :aria-expanded="open"
      aria-controls="notification-panel"
      @click="toggle"
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
      ><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" /></svg>
      <span
        v-if="data.unreadCount"
        class="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-up px-1 text-center font-mono text-[11px] font-bold leading-5 text-white"
      >{{ data.unreadCount > 99 ? '99+' : data.unreadCount }}</span>
    </button>

    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="open = false"
    />
    <section
      v-if="open"
      id="notification-panel"
      class="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-paper-line bg-paper-surface shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-paper-line px-4 py-3">
        <h2 class="font-display text-base font-extrabold">
          通知
        </h2>
        <button
          v-if="data.unreadCount"
          type="button"
          class="min-h-[36px] text-sm text-ink hover:underline"
          @click="markAll"
        >
          全部標為已讀
        </button>
      </div>
      <ul class="max-h-96 divide-y divide-paper-line overflow-y-auto">
        <li
          v-for="n in data.items"
          :key="n.id"
          class="px-4 py-3"
          :class="!n.readAt && 'bg-ink-soft'"
        >
          <router-link
            v-if="n.stockId"
            :to="{ name: 'stock-detail', params: { id: n.stockId } }"
            class="text-sm font-bold text-gray-900 hover:text-ink"
            @click="open = false"
          >
            {{ n.title }}
          </router-link>
          <div
            v-else
            class="text-sm font-bold text-gray-900"
          >
            {{ n.title }}
          </div>
          <div class="mt-0.5 text-xs text-gray-600">
            {{ n.body }}
          </div>
          <div class="mt-1 font-mono text-[11px] text-gray-500">
            {{ fmtTime(n.createdAt) }}
          </div>
        </li>
        <li
          v-if="!data.items.length"
          class="px-4 py-8 text-center text-sm text-gray-500"
        >
          目前沒有通知
        </li>
      </ul>
      <router-link
        :to="{ name: 'alerts' }"
        class="block border-t border-paper-line px-4 py-3 text-center text-sm text-ink hover:bg-gray-50"
        @click="open = false"
      >
        管理提醒
      </router-link>
    </section>
  </div>
</template>
