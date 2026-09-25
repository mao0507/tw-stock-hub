<script setup lang="ts">
import {
  AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription,
} from 'radix-vue'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'light' | 'dark'
  danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '確定',
  cancelText: '取消',
  variant: 'light',
  danger: false,
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onUpdateOpen(value: boolean): void {
  if (!value) emit('cancel')
}
</script>

<template>
  <AlertDialogRoot
    :open="open"
    @update:open="onUpdateOpen"
  >
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-up" />
      <AlertDialogContent
        :class="cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl2 p-6 shadow-xl focus:outline-none',
          variant === 'dark' ? 'bg-gray-900 border border-white/10' : 'bg-white',
        )"
      >
        <AlertDialogTitle :class="['font-display text-base font-semibold', variant === 'dark' ? 'text-white' : 'text-gray-900']">
          {{ title }}
        </AlertDialogTitle>
        <AlertDialogDescription
          v-if="description"
          :class="['mt-2 text-sm', variant === 'dark' ? 'text-gray-400' : 'text-gray-500']"
        >
          {{ description }}
        </AlertDialogDescription>
        <div
          v-else
          class="mt-2"
        >
          <slot />
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            :class="cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              variant === 'dark'
                ? 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900',
            )"
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            :class="cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-ink hover:bg-ink-hover',
            )"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
