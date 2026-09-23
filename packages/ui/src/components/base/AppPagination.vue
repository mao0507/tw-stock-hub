<script setup lang="ts">
import {
  PaginationRoot, PaginationList, PaginationListItem,
  PaginationPrev, PaginationNext, PaginationEllipsis,
} from 'radix-vue'

interface Props {
  page: number
  totalPages: number
  total?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'page-change': [page: number] }>()
</script>

<template>
  <PaginationRoot
    :page="page"
    :total="totalPages"
    :items-per-page="1"
    :sibling-count="1"
    @update:page="emit('page-change', $event)"
  >
    <div class="flex items-center gap-1">
      <PaginationPrev
        :disabled="page <= 1"
        as="button"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
      >‹</PaginationPrev>

      <PaginationList
        v-slot="{ items }"
        class="flex items-center gap-1"
      >
        <template
          v-for="(item, i) in items"
          :key="i"
        >
          <PaginationEllipsis
            v-if="item.type === 'ellipsis'"
            class="px-1 text-gray-400"
          >…</PaginationEllipsis>
          <PaginationListItem
            v-else
            :value="item.value"
            as="button"
            :class="[
              'flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium',
              item.value === page
                ? 'bg-up text-white'
                : 'border border-gray-200 hover:bg-gray-50 text-gray-700',
            ]"
          >{{ item.value }}</PaginationListItem>
        </template>
      </PaginationList>

      <PaginationNext
        :disabled="page >= totalPages"
        as="button"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
      >›</PaginationNext>

      <span
        v-if="total !== undefined"
        class="ml-2 text-xs text-gray-400"
      >
        共 {{ total }} 筆
      </span>
    </div>
  </PaginationRoot>
</template>
