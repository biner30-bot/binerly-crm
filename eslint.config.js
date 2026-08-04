import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Only the classic Rules of Hooks pair, not eslint-plugin-react-hooks v7's
      // full React Compiler-readiness bundle (purity/set-state-in-effect/etc.) -
      // those flag a lot of normal, working pre-compiler React code as errors.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', args: 'none' }],
      // Single-file architecture doesn't fit Vite fast-refresh's one-component-per-file
      // assumption; this rule would just be noise here.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
];
