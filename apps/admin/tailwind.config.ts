import baseConfig from '@tw-stock-hub/tailwind-config'
import type { Config } from 'tailwindcss'

export default {
  ...baseConfig,
  content: [
    './index.html',
    './src/**/*.{vue,ts}',
    '../../packages/ui/src/**/*.{vue,ts}',
  ],
} satisfies Config
