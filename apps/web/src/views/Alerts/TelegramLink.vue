<script setup lang="ts">
// Telegram 推送綁定（#27）：產生綁定碼 → 在 Telegram 對 bot 按「開始」→ 回來按「完成綁定」
import { onMounted, ref } from 'vue'
import { alertsApi } from '@tw-stock-hub/api-client'
import { AppButton } from '@tw-stock-hub/ui'

const status = ref<{ enabled: boolean; linked: boolean; botUsername: string | null } | null>(null)
const link = ref<{ code: string; url: string; expiresInMinutes: number } | null>(null)
const busy = ref(false)
const message = ref('')

const errorOf = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback

async function load(): Promise<void> {
  try {
    status.value = await alertsApi.getTelegram()
  } catch (e) {
    console.warn('[TelegramLink] load failed', e)
  }
}

async function start(): Promise<void> {
  busy.value = true
  message.value = ''
  try {
    link.value = await alertsApi.createTelegramLink()
  } catch (e) {
    message.value = errorOf(e, '無法產生綁定碼')
  } finally {
    busy.value = false
  }
}

async function confirm(): Promise<void> {
  busy.value = true
  message.value = ''
  try {
    await alertsApi.confirmTelegramLink()
    link.value = null
    message.value = '綁定完成，之後的盤後提醒會同步推送到 Telegram。'
    await load()
  } catch (e) {
    message.value = errorOf(e, '綁定失敗，請稍後再試')
  } finally {
    busy.value = false
  }
}

async function unlink(): Promise<void> {
  busy.value = true
  try {
    await alertsApi.unlinkTelegram()
    message.value = '已解除綁定'
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section
    v-if="status"
    class="panel"
  >
    <div class="panel-hd items-center">
      <h2 class="panel-title">
        Telegram 推送
      </h2>
      <span
        class="badge"
        :class="status.linked ? 'bg-ink-soft text-ink' : 'bg-gray-100 text-gray-600'"
      >{{ !status.enabled ? '未啟用' : status.linked ? '已綁定' : '未綁定' }}</span>
    </div>
    <div class="space-y-3 p-5 text-sm text-gray-700">
      <p v-if="!status.enabled">
        伺服器尚未設定 Telegram bot（需在 <code class="font-mono">.env</code> 設定 TELEGRAM_BOT_TOKEN 與 TELEGRAM_BOT_USERNAME），目前只有站內通知。
      </p>

      <template v-else-if="status.linked">
        <p>提醒成立時會同時推送到你的 Telegram。</p>
        <AppButton
          variant="outline"
          size="sm"
          :loading="busy"
          @click="unlink"
        >
          解除綁定
        </AppButton>
      </template>

      <template v-else-if="link">
        <ol class="list-decimal space-y-1 pl-5">
          <li>
            開啟
            <a
              :href="link.url"
              target="_blank"
              rel="noopener"
              class="font-medium text-ink underline"
            >@{{ status.botUsername }}</a>
            並按「開始」（或傳送 <code class="font-mono">/start {{ link.code }}</code>）
          </li>
          <li>回到這裡按「完成綁定」（綁定碼 {{ link.expiresInMinutes }} 分鐘內有效）</li>
        </ol>
        <AppButton
          :loading="busy"
          @click="confirm"
        >
          完成綁定
        </AppButton>
      </template>

      <template v-else>
        <p>綁定後，盤後提醒除了站內通知，也會推送到 Telegram。</p>
        <AppButton
          :loading="busy"
          @click="start"
        >
          綁定 Telegram
        </AppButton>
      </template>

      <p
        v-if="message"
        role="status"
        class="text-sm text-gray-600"
      >
        {{ message }}
      </p>
    </div>
  </section>
</template>
