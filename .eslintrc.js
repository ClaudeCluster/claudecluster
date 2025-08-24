module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'off' // TypeScript handles this
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.d.ts'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off'
        // Remove TypeScript-specific rules for now to get basic linting working
      }
    }
  ]
};