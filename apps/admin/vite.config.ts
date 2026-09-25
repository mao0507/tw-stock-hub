import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      include: ['src/stores/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
  server: {
    port: 3003,
    proxy: {
      // 預設接本機 api；接 docker 時設 VITE_API_PROXY=http://localhost:8081（admin nginx 會注入 X-Admin-Key）
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3001', changeOrigin: true },
    },
  },
})
