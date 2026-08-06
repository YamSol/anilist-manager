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

  // Os testes do core moram em packages/core/src/*.test.ts (co-localizados com o
  // código), mas packages/core/tsconfig.json os EXCLUI de propósito: aquele
  // tsconfig é o de build e emitiria os testes em dist/. Sem projeto que os
  // contenha, o projectService recusa o arquivo com "was not found by the project
  // service" — e o pre-commit (lint-staged) barraria todo commit de teste.
  // Lint sem type-checking aqui é o mesmo trato já feito para os arquivos de
  // configuração logo abaixo. Ver RNF-08.
  {
    files: ['packages/core/src/**/*.test.ts'],
    extends: [ts.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node },
    },
  },

  // Configs de ferramenta que não pertencem a nenhum tsconfig do projeto.
  // Lint sem type-checking: incluí-las num tsconfig só para agradar o linter
  // poluiria o build dos pacotes.
  {
    files: [
      'eslint.config.js',
      'vitest.config.ts',
      'playwright.config.ts',
      'packages/*/vitest.config.ts',
      'apps/*/svelte.config.js',
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
