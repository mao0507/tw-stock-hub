<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  avatarUrl?: string | null
  nickname: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), { size: 'md' })

const sizeClass = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
}

const initials = computed(() => props.nickname.slice(0, 2))
</script>

<template>
  <div
    :class="[
      'flex flex-shrink-0 items-center justify-center rounded-full',
      sizeClass[size ?? 'md'],
      avatarUrl ? 'overflow-hidden' : 'bg-blue-50 font-semibold text-blue-600',
    ]"
  >
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="nickname"
      class="h-full w-full object-cover"
      referrerpolicy="no-referrer"
    >
    <span v-else>{{ initials }}</span>
  </div>
</template>
