import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Um único build alimenta todos os alvos de distribuição (AD-01):
 *   - `vite build`         → dist/ estático, servível por qualquer host
 *   - `vite build` + PWA   → instalável no celular e no desktop
 *   - deploy/Dockerfile    → o mesmo dist/ servido por nginx
 *   - (backlog) Capacitor  → reempacota o mesmo dist/ num APK
 *
 * O core é resolvido direto do fonte: sem passo de build intermediário no dev,
 * e o HMR atravessa a fronteira do pacote.
 */
/**
 * Proxy de troca de token (AD-10).
 *
 * O AniList não manda CORS no `/oauth/token` — verificado: o preflight OPTIONS
 * responde 404 e o POST volta sem `Access-Control-Allow-Origin`. Sem este proxy de
 * mesma origem, o browser não consegue trocar o authorization code, e o login só
 * funcionaria colando o token à mão.
 *
 * O equivalente em produção está em `deploy/nginx.conf`; os dois precisam expor o
 * mesmo caminho, que o core conhece como `TOKEN_PROXY_PATH`.
 */
const TOKEN_PROXY = {
  '/oauth/token': {
    target: 'https://anilist.co',
    changeOrigin: true,
    rewrite: () => '/api/v2/oauth/token',
  },
} as const;

/**
 * Prefixo de URL do build (AD-01).
 *
 * O padrão é a raiz, que é onde o dev server, o `vite preview` e o nginx do
 * container servem. GitHub Pages é o caso desviante: um project site vive num
 * subcaminho, e sem esse prefixo o `index.html` pede os assets em `/assets/…`,
 * que no Pages dá 404.
 *
 * O subcaminho é propriedade de *um* alvo de deploy, então entra por fora — via
 * `.env.pages`, lido pelo `--mode pages` — em vez de ficar fixo aqui, o que
 * quebraria todos os outros alvos. `BASE_PATH` também é aceito direto do
 * ambiente, para quem builda fora do npm script.
 *
 * O `/` no fim é obrigatório para o vite; garantimos aqui em vez de confiar em
 * quem escreveu a variável.
 */
function resolveBase(mode: string): string {
  // Uma `BASE_PATH` vazia cai no mesmo lugar que uma ausente: o `/` é reposto abaixo.
  const path = loadEnv(mode, process.cwd(), 'BASE_PATH').BASE_PATH ?? '/';
  return path.endsWith('/') ? path : `${path}/`;
}

export default defineConfig(({ mode }) => {
  const base = resolveBase(mode);

  return {
    base,

    resolve: {
      alias: {
        '@anilist-updater/core': fileURLToPath(
          new URL('../../packages/core/src/index.ts', import.meta.url),
        ),
      },
    },

    plugins: [
      svelte(),
      // Só age quando `process.env.VITEST` está setado — build e dev ficam idênticos.
      // Sem ele, o Vitest resolve `svelte` pela condição `default` (index-server.js)
      // e todo teste de componente morre em `mount(...) is not available on the server`;
      // ele também põe `@testing-library/svelte-core` em `ssr.noExternal`, sem o que o
      // Node tenta carregar o `wrapper-scaffold.svelte` do pacote e falha com
      // `Unknown file extension ".svelte"`. É o plugin oficial da própria lib.
      svelteTesting(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'AniList Manager',
          short_name: 'AniList',
          description: 'Organize, filtre e converta as prioridades da sua lista do AniList.',
          lang: 'pt-BR',
          theme_color: '#0d1117',
          background_color: '#0d1117',
          display: 'standalone',
          // Acompanham o `base`: num subcaminho, um `start_url` de raiz abriria o
          // PWA instalado fora do escopo do app.
          scope: base,
          start_url: base,
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // RNF-05: a casca funciona offline. As chamadas à API do AniList não são
          // cacheadas — dado de lista desatualizado é pior que um erro explícito.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],

    build: {
      target: 'es2022',
      sourcemap: true,
      // RNF-06: se o bundle inicial passar de 500 KB gzip, queremos saber.
      chunkSizeWarningLimit: 700,
    },

    server: {
      port: 5173,
      proxy: TOKEN_PROXY,
    },

    preview: {
      port: 3000,
      proxy: TOKEN_PROXY,
    },

    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      // Playwright cuida do E2E; o vitest não deve tentar rodá-lo.
      exclude: ['tests/e2e/**'],
      passWithNoTests: true,
    },
  };
});
