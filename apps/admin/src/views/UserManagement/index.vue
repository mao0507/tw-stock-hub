<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { useStaggerIn } from '@tw-stock-hub/ui'

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, 'tbody tr', { y: 6, stagger: 0.03 })

// 唯讀清單：本站為 Google 登入 + ALLOWED_EMAILS 邀請制，沒有帳號停用功能
interface AdminUser {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
  createdAt: string
  lastLoginAt: string | null
}

const users = ref<AdminUser[]>([])
const isLoading = ref(false)
const loadError = ref(false)
const searchQuery = ref('')

async function fetchUsers(): Promise<void> {
  isLoading.value = true
  loadError.value = false
  try {
    const { data } = await axios.get<AdminUser[]>('/api/admin/users')
    users.value = data
  } catch {
    users.value = []
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return q ? users.value.filter((u) => u.email.toLowerCase().includes(q) || u.nickname.toLowerCase().includes(q)) : users.value
})

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { hour12: false }) : '—')

onMounted(() => { void fetchUsers() })
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-4"
  >
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="searchQuery"
        placeholder="搜尋 email 或暱稱…"
        class="input-field w-64"
      >
      <span class="text-sm text-gray-500">
        共 <strong class="font-mono text-white">{{ users.length }}</strong> 位曾登入的使用者
      </span>
    </div>

    <p class="text-xs text-gray-500">
      要新增或移除使用者，請修改伺服器的 <code class="font-mono">ALLOWED_EMAILS</code> 並重新啟動 api。
      已發出的登入狀態會維持到 JWT 到期（預設 7 天）。
    </p>

    <div class="card overflow-hidden p-0">
      <div
        v-if="isLoading"
        class="py-8 text-center text-sm text-gray-500"
      >
        載入中…
      </div>
      <div
        v-else-if="loadError"
        role="alert"
        class="py-8 text-center text-sm text-up"
      >
        載入失敗，請確認 api 是否正常
      </div>
      <table
        v-else
        class="table-modern"
      >
        <thead>
          <tr>
            <th>Email</th>
            <th>暱稱</th>
            <th>首次登入</th>
            <th>最近登入</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in filteredUsers"
            :key="user.id"
          >
            <td>{{ user.email }}</td>
            <td class="text-gray-400">
              {{ user.nickname }}
            </td>
            <td class="font-mono text-xs text-gray-500">
              {{ fmt(user.createdAt) }}
            </td>
            <td class="font-mono text-xs text-gray-500">
              {{ fmt(user.lastLoginAt) }}
            </td>
          </tr>
          <tr v-if="!filteredUsers.length">
            <td
              colspan="4"
              class="border-b-0 py-8 text-center text-sm text-gray-600"
            >
              {{ searchQuery ? '無符合搜尋結果' : '目前沒有使用者' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
