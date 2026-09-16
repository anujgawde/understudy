// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', 'extras/**', '**/*.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // We dropped TypeScript project references when adopting Nest and Next, since
  // both own their own compilation. These rules put the package boundaries back:
  // a package may only import what its package.json declares.
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@understudy/*/src/*', '../../*/src/*'],
              message:
                'Import a package through its public entry point, not by reaching into its source.',
            },
          ],
        },
      ],
    },
  },

  // The target app is deliberately crude: it renders HTML by hand and is the
  // only place raw string templating is expected.
  {
    files: ['apps/target-app/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
);
