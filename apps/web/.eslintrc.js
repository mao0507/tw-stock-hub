module.exports = {
  extends: ['../../configs/eslint-config/vue.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    extraFileExtensions: ['.vue'],
  },
};
