// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
      '**/dist/**',
      '**/node_modules/**',
      // Frontend apps manage their own configs
      'apps/docs/**',
      'apps/web/**',
      // Stale generated paths inside api/src
      'apps/api/src/**/mnt/**',
      'apps/api/src/**/*.tsx',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Type-safety rules — warn rather than error to keep things unblocking initially
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',

      // Turned off until stricter mode is adopted
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',

      // Prettier — endOfLine: auto handles CRLF/LF across platforms
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
