import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'coverage/**', 'node_modules/**', 'electron/vendor/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // The codebase intentionally uses `any` at Web MIDI / test boundaries.
      '@typescript-eslint/no-explicit-any': 'off',
      // Empty functions are meaningful as no-op defaults (e.g. optional callbacks).
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // Electron's main process is CommonJS by design (.cjs).
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Test files: relaxed — fixtures and spies don't need docblock-level rigor.
    files: ['tests/**/*', 'scripts/**/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
