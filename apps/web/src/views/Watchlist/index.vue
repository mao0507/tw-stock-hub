<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import type { WatchlistGroup, WatchlistItem } from '@tw-stock-hub/types'
import { AppButton, AppInput, AppModal, EmptyState, LoadingSkeleton, StockPriceTag } from '@tw-stock-hub/ui'
import { useWatchlistStore } from '@/stores/watchlist.store'
import GroupFormModal from './GroupFormModal.vue'

const router = useRouter()
const store = useWatchlistStore()
const { groups, watchlist, sections, isLoading } = storeToRefs(store)

const actionError = ref<string | null>(null)
const busy = ref(false)

const groupFormOpen = ref(false)
const editingGroup = ref<WatchlistGroup | null>(null)
const deleteGroupTarget = ref<WatchlistGroup | null>(null)

const removeTarget = ref<WatchlistItem | null>(null)
const noteTarget = ref<WatchlistItem | null>(null)
const noteDraft = ref('')

onMounted(() => { void store.fetchWatchlist() })

/** 執行異動並統一處理錯誤與防重複點擊 */
async function run(action: () => Promise<void>, failMsg: string): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  actionError.value = null
  try {
    await action()
    return true
  } catch (e) {
    console.warn('[Watchlist] action failed', e)
    actionError.value = failMsg
    return false
  } finally {
    busy.value = false
  }
}

function openCreateGroup(): void {
  editingGroup.value = null
  groupFormOpen.value = true
}

function openEditGroup(g: WatchlistGroup): void {
  editingGroup.value = g
  groupFormOpen.value = true
}

async function submitGroup(form: { name: string; color: string | null }): Promise<void> {
  if (editingGroup.value) await store.updateGroup(editingGroup.value.id, form)
  else await store.createGroup(form.name, form.color)
}

// 對話框在操作完成後才關閉；忙碌中確認鈕為 loading 狀態，不會靜默吞掉點擊
async function confirmDeleteGroup(): Promise<void> {
  const g = deleteGroupTarget.value
  if (!g) return
  await run(() => store.deleteGroup(g.id), '刪除分組失敗，請稍後再試')
  deleteGroupTarget.value = null
}

async function confirmRemove(): Promise<void> {
  const item = removeTarget.value
  if (!item) return
  await run(() => store.remove(item.stockId), '移除失敗，請稍後再試')
  removeTarget.value = null
}

function openNote(item: WatchlistItem): void {
  noteTarget.value = item
  noteDraft.value = item.note ?? ''
}

async function saveNote(): Promise<void> {
  const item = noteTarget.value
  if (!item) return
  const ok = await run(() => store.updateNote(item.stockId, noteDraft.value.trim() || null), '備註儲存失敗')
  if (ok) noteTarget.value = null
}

function onMoveToGroup(item: WatchlistItem, value: string): void {
  void run(() => store.moveToGroup(item.stockId, value || null), '移動分組失敗')
}

function goToStock(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}
</script>

<template>
  <div class="space-y-6">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          自選股
        </h1>
        <div class="page-head-sub">
          WATCHLIST
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="page-head-meta">{{ watchlist.length }} 支追蹤中</span>
        <AppButton
          size="sm"
          variant="outline"
          @click="openCreateGroup"
        >
          新增分組
        </AppButton>
      </div>
    </header>

    <div
      v-if="actionError"
      role="alert"
      class="rounded-lg bg-red-50 p-3 text-sm text-red-600"
    >
      {{ actionError }}
    </div>

    <div
      v-if="isLoading && !watchlist.length && !groups.length"
      class="space-y-3"
    >
      <LoadingSkeleton
        v-for="i in 3"
        :key="i"
        type="card"
      />
    </div>

    <EmptyState
      v-else-if="!watchlist.length && !groups.length"
      title="還沒有追蹤任何股票"
      description="在個股頁點擊「加入自選」開始追蹤，也可以先建立分組"
      icon="star"
    />

    <section
      v-for="(section, sIdx) in sections"
      v-else
      :key="section.group?.id ?? 'ungrouped'"
      class="card p-0"
    >
      <div class="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <span
          class="h-3 w-3 rounded-full"
          :style="{ backgroundColor: section.group?.color ?? '#cdc4b1' }"
          aria-hidden="true"
        />
        <h2 class="font-semibold text-gray-800">
          {{ section.group?.name ?? '未分組' }}
        </h2>
        <span class="text-xs text-gray-400">{{ section.items.length }} 支</span>
        <div
          v-if="section.group"
          class="ml-auto flex items-center gap-1"
        >
          <AppButton
            size="sm"
            variant="ghost"
            :disabled="sIdx === 0 || busy"
            aria-label="分組上移"
            @click="run(() => store.moveGroup(section.group!.id, -1), '調整順序失敗')"
          >
            ↑
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            :disabled="sIdx === groups.length - 1 || busy"
            aria-label="分組下移"
            @click="run(() => store.moveGroup(section.group!.id, 1), '調整順序失敗')"
          >
            ↓
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            @click="openEditGroup(section.group)"
          >
            編輯
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            class="text-red-500"
            :disabled="busy"
            @click="deleteGroupTarget = section.group"
          >
            刪除
          </AppButton>
        </div>
      </div>

      <p
        v-if="!section.items.length"
        class="px-4 py-4 text-xs text-gray-400"
      >
        這個分組還沒有股票，可從其他分組移入
      </p>

      <ul class="divide-y divide-paper-line">
        <li
          v-for="(item, iIdx) in section.items"
          :key="item.stockId"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
        >
          <button
            type="button"
            class="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-left"
            @click="goToStock(item.stockId)"
          >
            <span class="font-mono text-sm font-bold text-ink hover:underline">{{ item.stockId }}</span>
            <span class="font-medium text-gray-800">{{ item.name }}</span>
          </button>

          <StockPriceTag
            v-if="item.close !== null"
            class="shrink-0"
            :price="item.close"
            :change-pct="item.changePct"
            size="sm"
          />
          <span
            v-else
            class="text-xs text-gray-400"
          >無行情</span>

          <!-- 手機：操作列獨立一行；桌機併在同一列 -->
          <div class="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <select
              class="input-field h-9 w-28 py-0 text-xs"
              :value="item.groupId ?? ''"
              aria-label="移動到分組"
              :disabled="busy"
              @change="onMoveToGroup(item, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                未分組
              </option>
              <option
                v-for="g in groups"
                :key="g.id"
                :value="g.id"
              >
                {{ g.name }}
              </option>
            </select>

            <div class="flex items-center gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="iIdx === 0 || busy"
                aria-label="上移"
                @click="run(() => store.moveItem(item.stockId, -1), '調整順序失敗')"
              >
                ↑
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="iIdx === section.items.length - 1 || busy"
                aria-label="下移"
                @click="run(() => store.moveItem(item.stockId, 1), '調整順序失敗')"
              >
                ↓
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                @click="openNote(item)"
              >
                備註
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                class="text-red-500"
                :disabled="busy"
                @click="removeTarget = item"
              >
                移除
              </AppButton>
            </div>
          </div>

          <p
            v-if="item.note"
            class="w-full text-xs text-gray-500"
          >
            備註：{{ item.note }}
          </p>
        </li>
      </ul>
    </section>

    <GroupFormModal
      :open="groupFormOpen"
      :group="editingGroup"
      :submit="submitGroup"
      @close="groupFormOpen = false"
    />

    <AppModal
      :open="!!deleteGroupTarget"
      title="刪除分組"
      size="sm"
      @close="deleteGroupTarget = null"
    >
      <p class="text-sm text-gray-600">
        確定刪除「{{ deleteGroupTarget?.name }}」？組內股票會移到「未分組」，不會被移除。
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="deleteGroupTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            variant="destructive"
            :loading="busy"
            @click="confirmDeleteGroup"
          >
            刪除分組
          </AppButton>
        </div>
      </template>
    </AppModal>

    <AppModal
      :open="!!removeTarget"
      title="確認移除"
      size="sm"
      @close="removeTarget = null"
    >
      <p class="text-sm text-gray-600">
        確定要從自選股中移除
        <strong class="font-mono text-gray-900">{{ removeTarget?.stockId }} {{ removeTarget?.name }}</strong>？
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="removeTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            variant="destructive"
            :loading="busy"
            @click="confirmRemove"
          >
            確認移除
          </AppButton>
        </div>
      </template>
    </AppModal>

    <AppModal
      :open="!!noteTarget"
      title="編輯備註"
      size="sm"
      @close="noteTarget = null"
    >
      <AppInput
        v-model="noteDraft"
        :label="`${noteTarget?.stockId ?? ''} 的備註（最多 200 字）`"
        placeholder="例：長期持有、等回檔"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="noteTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            :loading="busy"
            @click="saveNote"
          >
            儲存
          </AppButton>
        </div>
      </template>
    </AppModal>
  </div>
</template>
