import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Globais de DOM proibidos em packages/core — ver RNF-03 em docs/REQUIREMENTS.md. */
const DOM_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'alert',
  'fetch',
];

export default ts.config(
  {
    ignores: [
      // Worktrees das frentes paralelas: são checkouts completos do próprio repo.
      // Sem esta linha o eslint lintaria cada branch em andamento junto com a atual.
      '.claude/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.svelte-kit/**',
    ],
  },

  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...ts.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Um @ts-expect-error precisa dizer por quê (RNF-07).
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // RNF-03: o core é TypeScript puro, sem DOM e sem I/O implícito.
  // Tudo que vem de fora (fetch, relógio, sleep) é injetado.
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS.map((name) => ({
          name,
          message: `packages/core não pode depender de "${name}" (RNF-03). Injete a dependência via options.`,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['svelte', 'svelte/*', 'vite', 'ag-grid-*', '@anilist-updater/web'],
              message: 'packages/core não pode depender da camada de UI (RNF-03, AD-04).',
            },
          ],
        },
      ],
    },
  },

  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        parser: ts.parser,
        projectService: true,
        extraFileExtensions: ['.svelte'],
      },
    },
  },

  {
    files: ['apps/**/*.{ts,svelte}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Configs de ferramenta e scripts que não pertencem a nenhum tsconfig do
  // projeto. Lint sem type-checking: incluí-los num tsconfig só para agradar o
  // linter poluiria o build dos pacotes.
  //
  // Os testes do core NÃO entram aqui — packages/core/tsconfig.json os inclui de
  // propósito, justamente para que recebam lint type-aware (no-floating-promises
  // e afins). A emissão para dist/ fica em tsconfig.build.json, que os exclui.
  {
    files: [
      'eslint.config.js',
      'vitest.config.ts',
      'playwright.config.ts',
      'packages/*/vitest.config.ts',
      'apps/*/svelte.config.js',
      'deploy/**/*.{js,mjs,cjs}',
    ],
    extends: [ts.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node },
    },
  },

  // Configs que estão dentro de um tsconfig (ex.: apps/web/vite.config.ts).
  {
    files: ['apps/*/vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  prettier,
);
