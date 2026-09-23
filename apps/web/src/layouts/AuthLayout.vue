<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
    <div class="w-full max-w-sm animate-fade-up">
      <div class="mb-8 text-center">
        <h1 class="font-display text-2xl font-bold tracking-tight text-gray-900">
          台<span class="text-up">股</span>盤後資料站
        </h1>
        <p class="mt-1 text-sm text-gray-400">
          每日盤後自動更新
        </p>
      </div>
      <RouterView />
    </div>
  </div>
</template>
