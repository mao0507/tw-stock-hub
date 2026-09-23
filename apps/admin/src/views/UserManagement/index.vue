<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useStaggerIn } from '@tw-stock-hub/ui'

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, 'tbody tr', { y: 6, stagger: 0.03 })

interface AdminUser {
  id: string
  email: string
  nickname: string
  authProvider: string
  isActive: boolean
  createdAt: string
}

const users = ref<AdminUser[]>([])
const isLoading = ref(false)
const toggleLoading = ref<string | null>(null)
const searchQuery = ref('')

async function fetchUsers(): Promise<void> {
  isLoading.value = true
  try {
    const { data } = await axios.get<AdminUser[]>('/api/admin/users')
    users.value = data
  } catch {
    users.value = []
  } finally {
    isLoading.value = false
  }
}

async function toggleUserStatus(userId: string, currentActive: boolean): Promise<void> {
  if (!confirm(`確定要${currentActive ? '停用' : '啟用'}此帳號？`)) return
  toggleLoading.value = userId
  try {
    await axios.patch(`/api/admin/users/${userId}`, { isActive: !currentActive })
    users.value = users.value.map(u =>
      u.id === userId ? { ...u, isActive: !currentActive } : u
    )
  } catch {
    alert('操作失敗')
  } finally {
    toggleLoading.value = null
  }
}

function filteredUsers(): AdminUser[] {
  return users.value.filter(u =>
    u.email.includes(searchQuery.value) ||
    u.nickname.includes(searchQuery.value)
  )
}

onMounted(() => { void fetchUsers() })

function providerLabel(p: string): string {
  return ({ local: '一般', google: 'Google', both: '兩者' } as Record<string, string>)[p] ?? p
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-4"
  >
    <div class="flex items-center gap-3">
      <input
        v-model="searchQuery"
        placeholder="搜尋 email 或暱稱…"
        class="input-field w-64"
      >
      <span class="text-sm text-gray-500">
        共 <strong class="font-mono text-white">{{ users.length }}</strong> 位會員
        （活躍 <strong class="font-mono text-down">{{ users.filter(u => u.isActive).length }}</strong>）
      </span>
    </div>

    <div class="card overflow-hidden p-0">
      <div
        v-if="isLoading"
        class="py-8 text-center text-sm text-gray-500"
      >
        載入中…
      </div>
      <table
        v-else
        class="table-modern"
      >
        <thead>
          <tr>
            <th>Email</th>
            <th>暱稱</th>
            <th><div class="flex justify-center">登入方式</div></th>
            <th><div class="flex justify-center">狀態</div></th>
            <th>註冊時間</th>
            <th><div class="flex justify-end">操作</div></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in filteredUsers()"
            :key="user.id"
            :class="!user.isActive && 'opacity-50'"
          >
            <td>{{ user.email }}</td>
            <td class="text-gray-400">{{ user.nickname }}</td>
            <td>
              <div class="flex justify-center">
                <span class="badge bg-white/5 text-gray-400">
                  {{ providerLabel(user.authProvider) }}
                </span>
              </div>
            </td>
            <td>
              <div class="flex justify-center">
                <span :class="user.isActive ? 'badge-ok' : 'badge bg-white/5 text-gray-600'">
                  {{ user.isActive ? '活躍' : '已停用' }}
                </span>
              </div>
            </td>
            <td class="font-mono text-xs text-gray-500">
              {{ new Date(user.createdAt).toLocaleDateString('zh-TW') }}
            </td>
            <td>
              <div class="flex justify-end">
                <button
                  :disabled="toggleLoading === user.id"
                  :class="[
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-30',
                    user.isActive ? 'text-up hover:bg-up/10' : 'text-down hover:bg-down/10',
                  ]"
                  @click="toggleUserStatus(user.id, user.isActive)"
                >
                  {{ toggleLoading === user.id ? '處理中' : user.isActive ? '停用' : '啟用' }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredUsers().length">
            <td
              colspan="6"
              class="border-b-0 py-8 text-center text-sm text-gray-600"
            >
              {{ searchQuery ? '無符合搜尋結果' : '目前沒有會員' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
