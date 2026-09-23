<script setup lang="ts">
import { computed, useId } from 'vue'
import { cn } from '../../lib/utils'

interface Props {
  modelValue?: string | number
  label?: string
  placeholder?: string
  error?: string | undefined
  disabled?: boolean
  type?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [e: FocusEvent]
}>()

const id = useId()

const inputClass = computed(() =>
  cn(
    'w-full h-10 rounded-lg border px-3 text-sm text-gray-900',
    'bg-white placeholder:text-gray-400',
    'transition-colors duration-150 outline-none',
    'focus:border-up focus:ring-2 focus:ring-up/20',
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
    props.error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-200',
    props.class,
  ),
)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" :for="id" class="text-sm font-medium text-gray-700">
      {{ label }}
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="inputClass"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur', $event)"
    >
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
