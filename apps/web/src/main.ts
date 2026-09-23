import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupTokenStore, setupInterceptors, stockApiClient, authApiClient } from '@tw-stock-hub/api-client'
import { useAuthStore } from '@/stores/auth.store'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const authStore = useAuthStore()

setupTokenStore({
  getAccessToken: () => authStore.accessToken,
  getRefreshToken: () => authStore.refreshToken,
  setTokens: (access, refresh) => authStore.setTokens(access, refresh),
  clearTokens: () => authStore.clearTokens(),
  redirectToLogin: () => { void router.push('/login') },
})

setupInterceptors(stockApiClient)
setupInterceptors(authApiClient, true)

app.mount('#app')
