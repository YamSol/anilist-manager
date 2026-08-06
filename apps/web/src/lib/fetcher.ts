/**
 * Adaptador de `fetch` do browser para o `Fetcher` do core.
 *
 * O core não referencia `fetch` global (RNF-03): quem resolve a implementação é
 * a camada chamadora. Aqui é uma linha; num CLI Node seria o `undici`, e nos
 * testes é um duplo — sem que o core precise saber a diferença (AD-04).
 */

import type { Fetcher } from '@anilist-updater/core';

export const browserFetcher: Fetcher = (url, init) => fetch(url, init);
