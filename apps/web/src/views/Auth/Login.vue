<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { GoogleLoginButton } from '@tw-stock-hub/ui'

const route = useRoute()
const authStore = useAuthStore()
const loading = ref(false)

const notInvited = computed(() => route.query['error'] === 'not_invited')

function onGoogleLogin(): void {
  loading.value = true
  authStore.login(route.query['redirect'] as string | undefined)
}

// 從 Google 按上一頁時瀏覽器可能從 bfcache 還原頁面，loading 會卡住
function onPageShow(e: PageTransitionEvent): void {
  if (e.persisted) loading.value = false
}
onMounted(() => window.addEventListener('pageshow', onPageShow))
onBeforeUnmount(() => window.removeEventListener('pageshow', onPageShow))
</script>

<template>
  <div class="card">
    <h2 class="mb-1 font-display text-xl font-extrabold text-gray-900">
      登入
    </h2>
    <p class="mb-5 text-sm text-gray-500">
      本站採邀請制，請使用受邀的 Google 帳號登入
    </p>

    <div
      v-if="notInvited"
      role="alert"
      class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600"
    >
      此 Google 帳號不在邀請名單內。如需使用，請聯絡站長。
    </div>

    <GoogleLoginButton
      :loading="loading"
      :full-width="true"
      @click="onGoogleLogin"
    />
  </div>
</template>
