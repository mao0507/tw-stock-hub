import baseConfig from '@tw-stock-hub/tailwind-config'
import type { Config } from 'tailwindcss'

export default {
  ...baseConfig,
  content: ['./src/**/*.{vue,ts}'],
} satisfies Config
