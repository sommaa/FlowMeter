// Flat ESLint config (ESLint v9). This codebase shipped without a working lint
// setup, so the config is intentionally lean: it hard-enforces the things we care
// about for release hygiene (no stray debug output) as errors, and surfaces the
// pre-existing React-hook issues as warnings to be triaged for the 1.0 stable
// release rather than blocking the alpha build.
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'docs/**',
      'node_modules/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Release hygiene: no debug output ships in the bundle (warn/error allowed).
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      // Pre-existing React-hook issues: surfaced as warnings, tracked for 1.0.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
