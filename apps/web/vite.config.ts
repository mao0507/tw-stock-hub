import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      include: ['src/stores/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
