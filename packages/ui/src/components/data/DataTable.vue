<script setup lang="ts" generic="T extends Record<string, unknown>">
import { ref } from 'vue'

interface Column<Row> {
  key: keyof Row | string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
}

interface Props {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  skeletonRows?: number
  rowKey?: keyof T
  stickyHeader?: boolean
  emptyText?: string
  onRowClick?: (row: T) => void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  skeletonRows: 10,
  emptyText: '目前沒有資料',
  stickyHeader: true,
})

const sortKey = ref<string | null>(null)
const sortOrder = ref<'asc' | 'desc'>('asc')

function handleSort(key: string, sortable?: boolean) {
  if (!sortable) return
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const alignClass = (align?: string) => ({
  left: 'text-left', center: 'text-center', right: 'text-right',
}[align ?? 'left'])
</script>

<template>
  <div class="w-full overflow-x-auto rounded-xl border border-gray-100">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-100 bg-gray-50">
          <th
            v-for="col in columns"
            :key="String(col.key)"
            :class="[
              'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400',
              alignClass(col.align),
              col.sortable && 'cursor-pointer select-none hover:text-gray-600',
              stickyHeader && 'sticky top-0 bg-gray-50',
              col.width ?? '',
            ]"
            @click="handleSort(String(col.key), col.sortable)"
          >
            <span class="inline-flex items-center gap-1">
              {{ col.label }}
              <span v-if="col.sortable" class="text-gray-300">
                {{ sortKey === String(col.key) ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </span>
          </th>
        </tr>
      </thead>

      <tbody v-if="loading">
        <tr v-for="i in skeletonRows" :key="i" class="border-b border-gray-50">
          <td v-for="col in columns" :key="String(col.key)" class="px-3 py-3">
            <div class="h-4 animate-pulse rounded bg-gray-100" />
          </td>
        </tr>
      </tbody>

      <tbody v-else-if="data.length === 0">
        <tr>
          <td :colspan="columns.length" class="py-12 text-center text-sm text-gray-400">
            {{ emptyText }}
          </td>
        </tr>
      </tbody>

      <tbody v-else>
        <tr
          v-for="(row, i) in data"
          :key="rowKey ? String(row[rowKey]) : i"
          :class="[
            'border-b border-gray-50 transition-colors',
            onRowClick && 'cursor-pointer hover:bg-gray-50',
          ]"
          @click="onRowClick?.(row)"
        >
          <td
            v-for="col in columns"
            :key="String(col.key)"
            :class="['px-3 py-3 text-gray-800', alignClass(col.align)]"
          >
            <slot :name="`cell-${String(col.key)}`" :row="row" :value="row[col.key as keyof T]">
              {{ row[col.key as keyof T] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
