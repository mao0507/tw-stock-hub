/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    extraFileExtensions: ['.vue'],
  },
  extends: [
    './base.js',
    'plugin:vue/vue3-recommended',
  ],
  rules: {
    'vue/component-api-style': ['error', ['script-setup']],
    'vue/define-macros-order': ['error', {
      order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots'],
    }],
    'vue/block-lang': ['error', { script: { lang: 'ts' } }],
    'vue/no-unused-vars': 'error',
    'vue/multi-word-component-names': 'off',
  },
}
