import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/admin'),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/Dashboard/index.vue'),
          meta: { title: '儀表板' },
        },
        {
          path: 'crawler',
          name: 'crawler-status',
          component: () => import('@/views/CrawlerStatus/index.vue'),
          meta: { title: '爬蟲監控' },
        },
        {
          path: 'data-health',
          name: 'data-health',
          component: () => import('@/views/DataHealth/index.vue'),
          meta: { title: '資料健康' },
        },
        {
          path: 'users',
          name: 'user-management',
          component: () => import('@/views/UserManagement/index.vue'),
          meta: { title: '會員管理' },
        },
      ],
    },
  ],
})

export default router
