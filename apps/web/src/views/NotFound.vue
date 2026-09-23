<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <div class="text-6xl">
      📊
    </div>
    <h1 class="text-2xl font-bold text-gray-800">
      找不到此頁面
    </h1>
    <p class="text-sm text-gray-400">
      您訪問的頁面不存在或已移除
    </p>
    <button
      class="mt-2 rounded-lg bg-up px-6 py-2.5 text-sm font-medium text-white hover:bg-up/90"
      @click="void router.push('/')"
    >
      回到首頁
    </button>
  </div>
</template>
