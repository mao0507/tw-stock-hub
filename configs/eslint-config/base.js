/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // 中文介面常用全形空白排版，字串與樣板字串內允許
    'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true }],
  },
  overrides: [
    {
      // vi.mocked(api.fn) / expect(api.fn) 會被誤判為未綁定方法
      files: ['*.spec.ts', '*.test.ts'],
      rules: { '@typescript-eslint/unbound-method': 'off' },
    },
  ],
}
