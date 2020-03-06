module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    '@side-eng/base',
    '@side-eng/prettier',
    'plugin:@typescript-eslint/recommended',
    'prettier/@typescript-eslint',
  ],
  plugins: ['@typescript-eslint'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
      },
    },
    'import/extensions': ['.mjs', '.js', '.jsx', '.ts', '.tsx'],
  },
  rules: {
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        mjs: 'never',
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],

    // FIXME: Remove when we are using a different logger other than console
    'no-console': 0,
    // FIXME: Remove once we fix all the <any> type definitions
    '@typescript-eslint/no-explicit-any': 0,
  },
};
