<script setup lang="ts">
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent,
  DialogTitle, DialogClose,
} from 'radix-vue'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), { size: 'md' })
const emit = defineEmits<{ close: [] }>()

const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

function onUpdateOpen(value: boolean): void {
  if (!value) emit('close')
}
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="onUpdateOpen"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-up" />
      <DialogContent
        :class="cn(
          'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
          'rounded-xl2 bg-white shadow-xl focus:outline-none',
          sizeClass[size ?? 'md'],
        )"
      >
        <div
          v-if="title || $slots.header"
          class="flex items-center justify-between border-b border-gray-100 px-6 py-4"
        >
          <slot name="header">
            <DialogTitle class="font-display text-base font-semibold text-gray-900">
              {{ title }}
            </DialogTitle>
          </slot>
          <DialogClose class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </DialogClose>
        </div>
        <div class="px-6 py-4">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="border-t border-gray-100 px-6 py-4"
        >
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
