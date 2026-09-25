<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectRoot, SelectTrigger, SelectValue, SelectIcon, SelectPortal,
  SelectContent, SelectViewport, SelectItem, SelectItemText, SelectItemIndicator,
  SelectScrollUpButton, SelectScrollDownButton,
} from 'radix-vue'
import { cn } from '../../lib/utils'

interface SelectOption {
  label: string
  value: string | number
}

interface Props {
  modelValue?: string | number
  options: SelectOption[]
  placeholder?: string
  label?: string
  error?: string
  disabled?: boolean
  variant?: 'light' | 'dark'
  class?: string
}

const props = withDefaults(defineProps<Props>(), { disabled: false, variant: 'light' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onUpdate(value: string | number): void {
  emit('update:modelValue', String(value))
}

const isDark = computed(() => props.variant === 'dark')
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      :class="isDark ? 'text-sm font-medium text-gray-300' : 'text-sm font-medium text-gray-700'"
    >{{ label }}</label>

    <SelectRoot
      :model-value="modelValue !== undefined ? String(modelValue) : undefined"
      :disabled="disabled"
      @update:model-value="onUpdate"
    >
      <SelectTrigger
        :class="cn(
          'flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors outline-none',
          isDark
            ? 'border-white/10 bg-white/5 text-white focus:border-ink/60 data-[state=open]:border-ink/60'
            : 'border-gray-200 bg-white text-gray-900 focus:border-ink focus:ring-2 focus:ring-ink/20 data-[state=open]:border-ink',
          'disabled:cursor-not-allowed disabled:opacity-50',
          props.class,
        )"
      >
        <SelectValue :placeholder="placeholder ?? ''" />
        <SelectIcon as-child>
          <svg
            :class="['h-4 w-4 transition-transform data-[state=open]:rotate-180', isDark ? 'text-gray-500' : 'text-gray-400']"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><path d="M6 9l6 6 6-6" /></svg>
        </SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          :class="cn(
            'z-50 overflow-hidden rounded-xl2 border shadow-soft animate-fade-up',
            isDark ? 'border-white/10 bg-gray-900' : 'border-gray-100 bg-white',
          )"
          :side-offset="4"
          position="popper"
        >
          <SelectScrollUpButton :class="['flex h-6 items-center justify-center', isDark ? 'text-gray-500' : 'text-gray-400']">
            ▲
          </SelectScrollUpButton>
          <SelectViewport class="p-1">
            <SelectItem
              v-for="opt in options"
              :key="opt.value"
              :value="String(opt.value)"
              :class="cn(
                'relative flex cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 text-sm outline-none transition-colors',
                isDark
                  ? 'text-gray-300 data-[highlighted]:bg-white/10 data-[highlighted]:text-white data-[state=checked]:font-semibold data-[state=checked]:text-ink'
                  : 'text-gray-700 data-[highlighted]:bg-ink-soft data-[highlighted]:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink',
              )"
            >
              <SelectItemText>{{ opt.label }}</SelectItemText>
              <SelectItemIndicator>
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                ><path d="M20 6L9 17l-5-5" /></svg>
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
          <SelectScrollDownButton :class="['flex h-6 items-center justify-center', isDark ? 'text-gray-500' : 'text-gray-400']">
            ▼
          </SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

    <p
      v-if="error"
      class="text-xs text-red-500"
    >{{ error }}</p>
  </div>
</template>
