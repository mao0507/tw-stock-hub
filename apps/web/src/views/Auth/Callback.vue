<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const error = ref('')

onMounted(async () => {
  const accessToken = route.query['access_token'] as string | undefined
  const refreshToken = route.query['refresh_token'] as string | undefined
  const errorParam = route.query['error'] as string | undefined

  if (errorParam) {
    error.value = 'Google 登入失敗，請重試'
    setTimeout(() => { void router.push('/login') }, 3000)
    return
  }

  if (!accessToken || !refreshToken) {
    error.value = '登入資訊不完整，請重試'
    setTimeout(() => { void router.push('/login') }, 3000)
    return
  }

  try {
    authStore.setTokens(accessToken, refreshToken)
    await authStore.fetchMe()
    const redirect = route.query['redirect'] as string | undefined
    await router.replace(redirect ?? '/')
  } catch {
    error.value = '登入處理失敗，請重試'
    authStore.clearTokens()
    setTimeout(() => { void router.push('/login') }, 3000)
  }
})
</script>

<template>
  <div class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
    <template v-if="error">
      <svg
        class="h-10 w-10 text-up"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
      <p class="text-sm font-medium text-up">
        {{ error }}
      </p>
      <p class="text-xs text-gray-400">
        3 秒後自動導向登入頁…
      </p>
    </template>
    <template v-else>
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-up/20 border-t-up" />
      <p class="text-sm text-gray-500">
        登入中，請稍候…
      </p>
    </template>
  </div>
</template>
