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
        up: {
          DEFAULT: '#E84747',
          soft: 'rgba(232, 71, 71, 0.09)',
          mid: 'rgba(232, 71, 71, 0.18)',
        },
        down: {
          DEFAULT: '#1FA99E',
          soft: 'rgba(31, 169, 158, 0.09)',
          mid: 'rgba(31, 169, 158, 0.18)',
        },
        brand: {
          blue: '#1A6CF5',
          amber: '#D97706',
          purple: '#7C3AED',
          green: '#059669',
        },
      },
      fontFamily: {
        sans: ['Noto Sans TC', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.08)',
        glow: '0 0 0 1px rgba(232, 71, 71, 0.15), 0 8px 24px -8px rgba(232, 71, 71, 0.25)',
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
