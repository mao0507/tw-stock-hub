<script setup lang="ts">
interface Props {
  type?: 'table' | 'chart' | 'card' | 'list' | 'text'
  rows?: number
}

withDefaults(defineProps<Props>(), { type: 'text', rows: 3 })
</script>

<template>
  <div v-if="type === 'table'" class="w-full">
    <div class="mb-2 h-9 animate-pulse rounded-lg bg-gray-100" />
    <div v-for="i in rows" :key="i" class="mb-1.5 flex gap-2">
      <div class="h-10 flex-1 animate-pulse rounded bg-gray-50" style="animation-delay: 0.05s" />
      <div class="h-10 w-24 animate-pulse rounded bg-gray-50" style="animation-delay: 0.1s" />
      <div class="h-10 w-20 animate-pulse rounded bg-gray-50" style="animation-delay: 0.15s" />
    </div>
  </div>

  <div v-else-if="type === 'chart'" class="h-60 w-full animate-pulse rounded-xl bg-gray-100">
    <div class="flex h-full items-end gap-1 px-4 pb-4 pt-6">
      <div v-for="i in 12" :key="i"
        class="flex-1 animate-pulse rounded-t bg-gray-200"
        :style="{ height: `${20 + (i * 7) % 60}%`, animationDelay: `${i * 0.05}s` }"
      />
    </div>
  </div>

  <div v-else-if="type === 'card'" class="rounded-xl border border-gray-100 p-5">
    <div class="mb-3 h-4 w-1/3 animate-pulse rounded bg-gray-100" />
    <div class="mb-2 h-8 w-1/2 animate-pulse rounded bg-gray-100" />
    <div class="h-3 w-2/3 animate-pulse rounded bg-gray-50" />
  </div>

  <div v-else-if="type === 'list'" class="space-y-3">
    <div v-for="i in rows" :key="i" class="flex items-start gap-3">
      <div class="mt-1 h-4 w-4 flex-shrink-0 animate-pulse rounded-full bg-gray-100" />
      <div class="flex-1 space-y-1.5">
        <div class="h-3.5 animate-pulse rounded bg-gray-100" :style="{ width: `${60 + (i % 3) * 15}%` }" />
        <div class="h-3 w-1/3 animate-pulse rounded bg-gray-50" />
      </div>
    </div>
  </div>

  <div v-else class="space-y-2">
    <div v-for="i in rows" :key="i"
      class="h-3.5 animate-pulse rounded bg-gray-100"
      :style="{ width: `${100 - (i - 1) * 15}%`, animationDelay: `${i * 0.05}s` }"
    />
  </div>
</template>
