<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'
import {
  PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent,
  CalendarRoot, CalendarHeader, CalendarHeading, CalendarPrev, CalendarNext,
  CalendarGrid, CalendarGridHead, CalendarGridRow, CalendarHeadCell,
  CalendarGridBody, CalendarCell, CalendarCellTrigger,
} from 'radix-vue'
import { cn } from '../../lib/utils'

interface Props {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  variant?: 'light' | 'dark'
  class?: string
}

const props = withDefaults(defineProps<Props>(), { disabled: false, variant: 'light' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const isDark = computed(() => props.variant === 'dark')

const calendarValue = computed<CalendarDate | undefined>(() => {
  if (!props.modelValue) return undefined
  try {
    return parseDate(props.modelValue)
  } catch {
    return undefined
  }
})

function onUpdate(value: DateValue | undefined): void {
  emit('update:modelValue', value ? value.toString() : '')
}
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger
      :disabled="disabled"
      :class="cn(
        'flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors outline-none',
        isDark
          ? 'border-white/10 bg-white/5 text-white focus:border-up/60 data-[state=open]:border-up/60'
          : 'border-gray-200 bg-white text-gray-900 focus:border-up focus:ring-2 focus:ring-up/20 data-[state=open]:border-up',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )"
    >
      <svg
        :class="['h-4 w-4 flex-shrink-0', isDark ? 'text-gray-500' : 'text-gray-400']"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
      /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      <span :class="!modelValue && (isDark ? 'text-gray-500' : 'text-gray-400')">
        {{ modelValue || placeholder || '選擇日期' }}
      </span>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :side-offset="4"
        :class="cn(
          'z-50 rounded-xl2 border p-3 shadow-soft animate-fade-up',
          isDark ? 'border-white/10 bg-gray-900' : 'border-gray-100 bg-white',
        )"
      >
        <CalendarRoot
          v-slot="{ weekDays, grid }"
          :model-value="calendarValue"
          :class="isDark ? 'text-gray-200' : 'text-gray-700'"
          @update:model-value="onUpdate"
        >
          <CalendarHeader class="flex items-center justify-between pb-2">
            <CalendarPrev :class="['flex h-7 w-7 items-center justify-center rounded-md transition-colors', isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100']">
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M15 18l-6-6 6-6" /></svg>
            </CalendarPrev>
            <CalendarHeading class="text-sm font-medium" />
            <CalendarNext :class="['flex h-7 w-7 items-center justify-center rounded-md transition-colors', isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100']">
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M9 18l6-6-6-6" /></svg>
            </CalendarNext>
          </CalendarHeader>

          <CalendarGrid
            v-for="month in grid"
            :key="month.value.toString()"
            class="w-full border-collapse"
          >
            <CalendarGridHead>
              <CalendarGridRow class="flex w-full">
                <CalendarHeadCell
                  v-for="day in weekDays"
                  :key="day"
                  :class="['flex-1 text-center text-xs font-medium', isDark ? 'text-gray-500' : 'text-gray-400']"
                >
                  {{ day }}
                </CalendarHeadCell>
              </CalendarGridRow>
            </CalendarGridHead>
            <CalendarGridBody>
              <CalendarGridRow
                v-for="(weekDates, i) in month.rows"
                :key="`week-${i}`"
                class="flex w-full"
              >
                <CalendarCell
                  v-for="weekDate in weekDates"
                  :key="weekDate.toString()"
                  :date="weekDate"
                  class="flex-1 p-0.5 text-center"
                >
                  <CalendarCellTrigger
                    :day="weekDate"
                    :month="month.value"
                    :class="[
                      'flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors mx-auto',
                      'data-[selected]:bg-up data-[selected]:text-white data-[selected]:font-semibold',
                      'data-[today]:font-semibold',
                      'data-[outside-view]:opacity-30 data-[disabled]:opacity-30',
                      isDark ? 'hover:bg-white/10' : 'hover:bg-up-soft',
                    ]"
                  />
                </CalendarCell>
              </CalendarGridRow>
            </CalendarGridBody>
          </CalendarGrid>
        </CalendarRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
