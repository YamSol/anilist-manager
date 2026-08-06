import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de fumaça. A API do AniList é sempre mockada (route interception) —
 * nenhum teste toca a conta real de ninguém.
 */
export default defineConfig({
  testDir: './apps/web/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build --workspace @anilist-updater/web && npx vite preview --port 4173',
    cwd: './apps/web',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
