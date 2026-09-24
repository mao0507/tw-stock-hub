import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { apiClient, authApi, setupUnauthorizedHandler } from '@tw-stock-hub/api-client'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 登入失效：重新走 Google 登入，完成後回到目前頁面
setupUnauthorizedHandler(apiClient, () => {
  window.location.href = authApi.loginUrl(router.currentRoute.value.fullPath)
})

app.mount('#app')
