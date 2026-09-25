<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { CreateLotForm } from '@tw-stock-hub/types'
import { AppButton, AppModal } from '@tw-stock-hub/ui'
import { useAuthStore } from '@/stores/auth.store'
import { usePortfolioStore } from '@/stores/portfolio.store'
import { useWatchlistStore } from '@/stores/watchlist.store'
import LotFormModal from '@/views/Portfolio/LotFormModal.vue'

// 個股頁快捷入口：加入自選（可選分組）、記錄買入（預填代號與最新收盤價）
interface Props {
  stockId: string
  latestClose?: number | null
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const watchlistStore = useWatchlistStore()
const portfolioStore = usePortfolioStore()
const { isLoggedIn } = storeToRefs(authStore)
const { groups } = storeToRefs(watchlistStore)

const watched = computed(() => watchlistStore.isWatched(props.stockId))
const busy = ref(false)
const message = ref<{ text: string; error: boolean } | null>(null)
const groupPickerOpen = ref(false)
const pickedGroup = ref('')
const buyOpen = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

function notify(text: string, error = false): void {
  message.value = { text, error }
  clearTimeout(timer)
  timer = setTimeout(() => { message.value = null }, 3000)
}

async function addToWatchlist(groupId?: string): Promise<void> {
  busy.value = true
  try {
    await watchlistStore.add(props.stockId, groupId ? { groupId } : {})
    const name = groups.value.find((g) => g.id === groupId)?.name
    notify(name ? `已加入自選「${name}」` : '已加入自選')
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      // 可能在其他分頁已加入：以伺服器為準重新載入，按鈕狀態才會正確
      await watchlistStore.fetchWatchlist()
      notify('已經在自選股中')
    } else {
      notify('加入自選失敗，請稍後再試', true)
    }
  } finally {
    busy.value = false
  }
}

async function onWatchClick(): Promise<void> {
  if (watched.value) {
    busy.value = true
    try {
      await watchlistStore.remove(props.stockId)
      notify('已從自選移除')
    } catch {
      notify('移除失敗，請稍後再試', true)
    } finally {
      busy.value = false
    }
    return
  }
  if (groups.value.length === 0) {
    await addToWatchlist()
    return
  }
  pickedGroup.value = ''
  groupPickerOpen.value = true
}

async function confirmGroup(): Promise<void> {
  groupPickerOpen.value = false
  await addToWatchlist(pickedGroup.value || undefined)
}

async function submitBuy(form: CreateLotForm): Promise<void> {
  await portfolioStore.addLot(form)
  notify(`已記錄買入 ${form.stockId} ${form.shares.toLocaleString('zh-TW')} 股`)
}
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <a
      v-if="!isLoggedIn"
      :href="`/login?redirect=${encodeURIComponent(`/stocks/${stockId}`)}`"
      class="text-xs text-gray-400 hover:text-up"
    >登入後可加入自選、記錄買入</a>

    <div
      v-else
      class="flex items-center gap-2"
    >
      <AppButton
        data-test="watch"
        :variant="watched ? 'default' : 'outline'"
        size="sm"
        :loading="busy"
        @click="onWatchClick"
      >
        {{ watched ? '★ 已追蹤' : '☆ 加入自選' }}
      </AppButton>
      <AppButton
        data-test="buy"
        variant="outline"
        size="sm"
        @click="buyOpen = true"
      >
        記錄買入
      </AppButton>
    </div>

    <p
      v-if="message"
      role="status"
      class="text-xs"
      :class="message.error ? 'text-red-500' : 'text-up'"
    >
      {{ message.text }}
      <router-link
        v-if="!message.error && message.text.startsWith('已記錄買入')"
        to="/portfolio"
        class="ml-1 underline"
      >查看持股</router-link>
    </p>

    <AppModal
      :open="groupPickerOpen"
      title="加入自選"
      size="sm"
      @close="groupPickerOpen = false"
    >
      <label class="mb-1 block text-sm font-medium text-gray-700">分組</label>
      <select
        v-model="pickedGroup"
        data-test="group-select"
        class="input-field w-full"
      >
        <option value="">
          未分組
        </option>
        <option
          v-for="g in groups"
          :key="g.id"
          :value="g.id"
        >
          {{ g.name }}
        </option>
      </select>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="groupPickerOpen = false"
          >
            取消
          </AppButton>
          <AppButton
            data-test="confirm-watch"
            @click="confirmGroup"
          >
            加入
          </AppButton>
        </div>
      </template>
    </AppModal>

    <LotFormModal
      :open="buyOpen"
      :default-stock-id="stockId"
      :default-price="latestClose"
      :submit="submitBuy"
      @close="buyOpen = false"
    />
  </div>
</template>
