<script setup lang="ts">
import {
  TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent,
} from 'radix-vue'

interface Props {
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

withDefaults(defineProps<Props>(), { placement: 'top' })
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="placement"
          :side-offset="6"
          class="z-50 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-sm animate-fade-up"
        >
          {{ content }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
