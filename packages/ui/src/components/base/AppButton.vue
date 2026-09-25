<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap',
    'transition-all duration-150 cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
  ),
  {
    variants: {
      variant: {
        default: 'bg-ink text-white hover:bg-ink-hover focus-visible:ring-ink',
        outline: 'border border-gray-200 bg-paper-surface hover:bg-gray-100 text-gray-900',
        ghost: 'hover:bg-gray-100 text-gray-700',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        link: 'text-ink underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  loading: false,
  disabled: false,
  type: 'button',
})

const emit = defineEmits<{ click: [e: MouseEvent] }>()

const isDisabled = computed(() => props.disabled || props.loading)

const classes = computed(() =>
  cn(
    buttonVariants({
      variant: props.variant,
      size: props.variant === 'link' ? undefined : props.size,
    }),
    props.class,
  ),
)
</script>

<template>
  <button
    :type="type"
    :disabled="isDisabled"
    :class="classes"
    @click="emit('click', $event)"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <slot />
  </button>
</template>
