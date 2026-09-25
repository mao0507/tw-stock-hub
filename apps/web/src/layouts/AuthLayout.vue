<template>
  <div class="flex min-h-screen items-center justify-center bg-paper p-4">
    <div class="w-full max-w-sm animate-fade-up">
      <div class="mb-8 text-center">
        <h1 class="font-display text-[34px] font-extrabold tracking-wide text-ink">
          存股帳本
        </h1>
        <p class="mt-1 font-mono text-xs tracking-[0.18em] text-gray-500">
          TW STOCK HUB · 每日盤後更新
        </p>
      </div>
      <RouterView />
    </div>
  </div>
</template>
