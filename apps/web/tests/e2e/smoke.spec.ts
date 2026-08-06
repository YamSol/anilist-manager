/**
 * E2E de fumaça: o caminho crítico ponta a ponta.
 *
 *   informar Client ID → colar token → a lista renderiza →
 *   abrir a conversão e conferir as contagens
 *
 * A API do AniList é SEMPRE interceptada (`page.route`). Nenhum teste toca uma
 * conta real, nem em CI nem na máquina de ninguém — o único endpoint que a
 * aplicação chama é `graphql.anilist.co`, e ele nunca sai da máquina daqui.
 *
 * ═══ POR QUE ESTÁ `skip` NESTA BRANCH ═══
 * `packages/core` ainda é o esqueleto de contrato: `AniListClient.request`,
 * `normalizeCollection` e `planConversion` lançam `notImplemented`. Com o core
 * em stub, a lista nunca chega a renderizar e este teste falharia por um motivo
 * que não é dele.
 *
 * FASE 2 (depois do merge de `feat/core`): trocar `test.describe.skip` por
 * `test.describe` e rodar `npm run test:e2e`. Nada mais precisa mudar — as
 * rotas mockadas abaixo já respondem no formato que a `LIST_QUERY` espera.
 */

import { expect, test, type Page } from '@playwright/test';

const GRAPHQL = '**/graphql.anilist.co';

/** Resposta de `VIEWER_QUERY`. */
const VIEWER_RESPONSE = { data: { Viewer: { id: 4242 } } };

/**
 * Resposta de `LIST_QUERY`, no formato cru da API — o mesmo que
 * `normalizeCollection` recebe. "Sword Art Online" aparece em duas listas de
 * propósito: uma linha só, listas agregadas (RF-10).
 */
const LIST_RESPONSE = {
  data: {
    MediaListCollection: {
      lists: [
        {
          name: 'Assistindo',
          entries: [
            {
              mediaId: 11757,
              priority: 1,
              status: 'CURRENT',
              progress: 12,
              media: {
                title: {
                  english: 'Sword Art Online',
                  romaji: 'Sword Art Online',
                  native: 'ソードアート・オンライン',
                },
                format: 'TV',
                genres: ['Action', 'Adventure'],
                averageScore: 72,
                episodes: 25,
                season: 'SUMMER',
                seasonYear: 2012,
                coverImage: { medium: 'https://img.anili.st/media/11757' },
              },
            },
          ],
        },
        {
          name: 'Favoritos',
          entries: [
            {
              mediaId: 11757,
              priority: 1,
              status: 'CURRENT',
              progress: 12,
              media: {
                title: {
                  english: 'Sword Art Online',
                  romaji: 'Sword Art Online',
                  native: 'ソードアート・オンライン',
                },
                format: 'TV',
                genres: ['Action', 'Adventure'],
                averageScore: 72,
                episodes: 25,
                season: 'SUMMER',
                seasonYear: 2012,
                coverImage: { medium: 'https://img.anili.st/media/11757' },
              },
            },
            {
              // Sem título em inglês: cai para romaji (RF-12).
              mediaId: 154587,
              priority: 3,
              status: 'PLANNING',
              progress: 0,
              media: {
                title: { english: null, romaji: 'Sousou no Frieren', native: '葬送のフリーレン' },
                format: 'TV',
                genres: ['Adventure', 'Drama'],
                averageScore: 91,
                episodes: 28,
                season: 'FALL',
                seasonYear: 2023,
                coverImage: { medium: 'https://img.anili.st/media/154587' },
              },
            },
          ],
        },
        {
          name: 'Pausados',
          entries: [
            {
              // Prioridade 0: ignorada pela conversão (RF-22).
              mediaId: 115230,
              priority: 0,
              status: 'PAUSED',
              progress: 6,
              media: {
                title: { english: 'Tower of God', romaji: 'Kami no Tou', native: '神之塔' },
                format: 'ONA',
                genres: ['Action', 'Mystery'],
                averageScore: 74,
                episodes: 13,
                season: 'SPRING',
                seasonYear: 2020,
                coverImage: { medium: 'https://img.anili.st/media/115230' },
              },
            },
          ],
        },
      ],
    },
  },
};

/**
 * Intercepta TODA chamada ao AniList e responde a partir da query recebida.
 * Qualquer requisição não prevista devolve erro em vez de vazar para a rede.
 */
async function mockAniList(page: Page): Promise<void> {
  await page.route(GRAPHQL, async (route) => {
    const body = route.request().postDataJSON() as { query?: string } | null;
    const query = body?.query ?? '';

    if (query.includes('Viewer')) {
      await route.fulfill({ json: VIEWER_RESPONSE });
      return;
    }
    if (query.includes('MediaListCollection')) {
      await route.fulfill({ json: LIST_RESPONSE });
      return;
    }
    if (query.includes('SaveMediaListEntry')) {
      await route.fulfill({ json: { data: { SaveMediaListEntry: { id: 1, priority: 1 } } } });
      return;
    }
    await route.fulfill({
      status: 500,
      json: { errors: [{ message: `query inesperada: ${query}` }] },
    });
  });
}

test.describe.skip('caminho crítico (ligado na fase 2, quando o core sair do stub)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAniList(page);
    await page.goto('/');
  });

  test('RF-01/RF-04/RF-10/RF-22: setup, token colado, lista e conversão', async ({ page }) => {
    // RF-01: o Client ID é do próprio usuário e nada vem embutido no build.
    await page.getByLabel('Client ID').fill('12345');

    // RF-04: colar o token evita o redirect ao AniList, que não dá para mockar.
    await page.getByRole('button', { name: 'Colar token manualmente' }).click();
    await page.getByLabel('Access token').fill('token-de-teste');
    await page.getByRole('button', { name: 'Usar este token' }).click();

    // RF-10: um anime em duas listas vira UMA linha com as listas agregadas.
    await expect(page.getByText('Sword Art Online')).toHaveCount(1);
    await expect(page.getByText('Assistindo, Favoritos')).toBeVisible();
    // RF-12: sem título em inglês, cai para romaji.
    await expect(page.getByText('Sousou no Frieren')).toBeVisible();

    // RF-22: as contagens do plano, sem nenhuma escrita ter acontecido.
    await page.getByRole('link', { name: 'Converter escala' }).click();
    await expect(page.getByText('alteradas').locator('..')).toContainText('1');
    await expect(page.getByText('inalteradas').locator('..')).toContainText('1');
    await expect(page.getByText('ignoradas', { exact: false }).locator('..')).toContainText('1');

    // RF-23: aplicar continua travado enquanto o backup não sair.
    await expect(page.getByRole('button', { name: 'Aplicar no AniList' })).toBeDisabled();
  });

  test('RF-01: o Client ID sobrevive a um reload', async ({ page }) => {
    await page.getByLabel('Client ID').fill('98765');
    await page.getByRole('button', { name: 'Colar token manualmente' }).click();
    await page.getByLabel('Access token').fill('token-de-teste');
    await page.getByRole('button', { name: 'Usar este token' }).click();

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.reload();

    // RF-06: o token some, o Client ID fica.
    await expect(page.getByLabel('Client ID')).toHaveValue('98765');
  });
});
