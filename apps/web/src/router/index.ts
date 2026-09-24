import {
  createRouter, createWebHistory,
  type RouteRecordRaw, type NavigationGuardNext,
  type RouteLocationNormalized,
} from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/Home/index.vue'),
        meta: { title: '大盤總覽' },
      },
      {
        path: 'stocks/:id',
        name: 'stock-detail',
        component: () => import('@/views/Stock/index.vue'),
        meta: { title: '個股詳情' },
      },
      {
        path: 'institutional',
        name: 'institutional',
        component: () => import('@/views/Institutional/index.vue'),
        meta: { title: '法人動向' },
      },
      {
        path: 'margin',
        name: 'margin',
        component: () => import('@/views/Margin/index.vue'),
        meta: { title: '融資融券' },
      },
      {
        path: 'brokers',
        name: 'brokers',
        component: () => import('@/views/Broker/index.vue'),
        meta: { title: '分點總覽' },
      },
      {
        path: 'brokers/b/:name',
        name: 'broker-profile',
        component: () => import('@/views/BrokerProfile/index.vue'),
        meta: { title: '分點檔案' },
      },
      {
        path: 'screener',
        name: 'screener',
        component: () => import('@/views/Screener/index.vue'),
        meta: { title: '選股篩選器' },
      },
      {
        path: 'calendar',
        name: 'calendar',
        component: () => import('@/views/Calendar/index.vue'),
        meta: { title: '除權息行事曆' },
      },
      {
        path: 'watchlist',
        name: 'watchlist',
        component: () => import('@/views/Watchlist/index.vue'),
        meta: { title: '自選股', requiresAuth: true },
      },
      {
        path: 'alerts',
        name: 'alerts',
        component: () => import('@/views/Alerts/index.vue'),
        meta: { title: '價格警示', requiresAuth: true },
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      {
        path: 'login',
        name: 'login',
        component: () => import('@/views/Auth/Login.vue'),
        meta: { title: '登入', guestOnly: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '頁面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0, behavior: 'smooth' }
  },
})

router.beforeEach(async (
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext,
) => {
  const { useAuthStore } = await import('@/stores/auth.store')
  const authStore = useAuthStore()
  await authStore.initializeAuth()

  if (to.meta['requiresAuth'] && !authStore.isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta['guestOnly'] && authStore.isLoggedIn) {
    next({ name: 'home' })
    return
  }

  next()
})

const APP_NAME = '台股盤後資料站'

router.afterEach((to) => {
  const title = to.meta['title'] as string | undefined
  document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
})

export default router
