<script setup lang="ts">
import type { NewsCategory } from '@tw-stock-hub/types'
import { NEWS_CATEGORY_LABEL, NEWS_CATEGORY_COLOR } from '@tw-stock-hub/types'

interface Props {
  category: NewsCategory
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), { size: 'sm' })
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded font-semibold',
      size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs',
    ]"
    :style="{
      backgroundColor: NEWS_CATEGORY_COLOR[category].bg,
      color: NEWS_CATEGORY_COLOR[category].text,
    }"
  >
    {{ NEWS_CATEGORY_LABEL[category] }}
  </span>
</template>
