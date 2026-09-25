import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    '../../apps/*/src/**/*.{vue,ts}',
    '../../packages/*/src/**/*.{vue,ts}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 台股慣例：紅漲綠跌（搭配 ▲▼ 符號，不只靠顏色）
        up: {
          DEFAULT: '#c2412d',
          soft: 'rgba(194, 65, 45, 0.09)',
          mid: 'rgba(194, 65, 45, 0.2)',
        },
        down: {
          DEFAULT: '#1c7c54',
          soft: 'rgba(28, 124, 84, 0.09)',
          mid: 'rgba(28, 124, 84, 0.2)',
        },
        // 主色：墨綠（導覽、主要按鈕、持股摘要）
        ink: {
          DEFAULT: '#1f4d3a',
          hover: '#173a2c',
          soft: 'rgba(31, 77, 58, 0.08)',
        },
        paper: {
          DEFAULT: '#f6f2ea', // 頁面底色
          surface: '#fffdf8', // 卡片
          line: '#e3dccd', // 邊框
        },
        // 暖色灰階：取代預設冷灰，全站 gray-* 一次換成紙感；400 以上皆達 4.5:1 對比
        gray: {
          50: '#faf7f1',
          100: '#f1ece2',
          200: '#e3dccd',
          300: '#cdc4b1',
          400: '#75706a',
          500: '#625e57',
          600: '#4d4a44',
          700: '#3a3833',
          800: '#2a2c28',
          900: '#1d2420',
          950: '#121714',
        },
        brand: {
          blue: '#2f5d8a',
          amber: '#b7791f',
          purple: '#6b4f8a',
          green: '#1f4d3a',
        },
      },
      fontFamily: {
        sans: ['Noto Sans TC', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
        display: ['Noto Serif TC', 'serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        // 紙感：以邊框為主，陰影極淡
        soft: '0 1px 2px rgba(29, 36, 32, 0.04)',
        glow: '0 0 0 1px rgba(31, 77, 58, 0.2), 0 6px 18px -8px rgba(31, 77, 58, 0.3)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}

export default config
