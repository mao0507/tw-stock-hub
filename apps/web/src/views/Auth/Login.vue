<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { loginSchema } from '@tw-stock-hub/zod-schemas'
import { authApi } from '@tw-stock-hub/api-client'
import { AppInput, AppButton, GoogleLoginButton } from '@tw-stock-hub/ui'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = reactive({ email: '', password: '' })
const errors = ref<Record<string, string>>({})
const serverError = ref('')
const isLoading = ref(false)
const googleLoading = ref(false)

async function onSubmit(): Promise<void> {
  errors.value = {}
  serverError.value = ''

  const result = loginSchema.safeParse(form)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString() ?? ''
      errors.value[field] = issue.message
    }
    return
  }

  isLoading.value = true
  try {
    await authStore.login({ email: form.email, password: form.password })
    const redirect = route.query['redirect'] as string | undefined
    await router.push(redirect ?? '/')
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: { message?: string } } } })
      ?.response?.data?.error?.message
    serverError.value = msg ?? '登入失敗，請確認帳號與密碼'
  } finally {
    isLoading.value = false
  }
}

function onGoogleLogin(): void {
  googleLoading.value = true
  window.location.href = authApi.getGoogleAuthUrl()
}
</script>

<template>
  <div class="card">
    <h2 class="mb-1 font-display text-lg font-bold text-gray-900">
      歡迎回來
    </h2>
    <p class="mb-5 text-sm text-gray-400">
      登入以使用自選股與個人化功能
    </p>

    <div class="mb-5 flex overflow-hidden rounded-lg border border-gray-200">
      <span class="flex-1 bg-up py-2 text-center text-sm font-semibold text-white">登入</span>
      <router-link
        to="/register"
        class="flex-1 py-2 text-center text-sm font-medium text-gray-500 hover:bg-gray-50"
      >
        註冊
      </router-link>
    </div>

    <div
      v-if="serverError"
      class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600"
    >
      {{ serverError }}
    </div>

    <form
      class="space-y-4"
      @submit.prevent="onSubmit"
    >
      <AppInput
        v-model="form.email"
        label="電子郵件"
        type="email"
        placeholder="your@email.com"
        :error="errors['email']"
      />
      <AppInput
        v-model="form.password"
        label="密碼"
        type="password"
        placeholder="請輸入密碼"
        :error="errors['password']"
      />
      <AppButton
        type="submit"
        :loading="isLoading"
        class="w-full"
      >
        登入
      </AppButton>
    </form>

    <div class="relative my-5">
      <div class="absolute inset-0 flex items-center">
        <span class="w-full border-t border-gray-100" />
      </div>
      <div class="relative flex justify-center">
        <span class="bg-white px-3 text-xs text-gray-400">或</span>
      </div>
    </div>

    <GoogleLoginButton
      :loading="googleLoading"
      :full-width="true"
      @click="onGoogleLogin"
    />
  </div>
</template>
