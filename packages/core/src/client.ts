/**
 * Cliente da API GraphQL do AniList. Ver §5.5 de docs/REQUIREMENTS.md.
 *
 * Toda dependência externa — fetch, relógio, sleep — é injetada (AD-04). É isso
 * que torna throttle e backoff testáveis sem esperar tempo real passar.
 */

import { notImplemented } from './internal/stub.js';
import type { AnimeEntry, Priority } from './model.js';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface AniListClientOptions {
  readonly token: string;
  /** Default: `globalThis.fetch`, resolvido pela camada chamadora, não aqui. */
  readonly fetcher?: Fetcher;
  /** Default: `ANILIST_GRAPHQL_ENDPOINT`. */
  readonly endpoint?: string;
  /** Default: 90. Ver RNF-04. */
  readonly requestsPerMinute?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  /** Default: 3. Só se aplica a 429 e a falhas de rede. */
  readonly maxRetries?: number;
}

export class AniListClient {
  constructor(_options: AniListClientOptions) {
    notImplemented('AniListClient');
  }

  /**
   * Lança `AuthError` em 401, `RateLimitError` em 429 esgotado,
   * `GraphQLError` quando o corpo traz `errors`, `NetworkError` no resto.
   */
  request<T>(_query: string, _variables?: Record<string, unknown>): Promise<T> {
    return notImplemented('AniListClient.request');
  }

  getViewerId(): Promise<number> {
    return notImplemented('AniListClient.getViewerId');
  }

  /** Ver RF-10, RF-11. Já devolve normalizado. */
  getAnimeList(_userId: number): Promise<AnimeEntry[]> {
    return notImplemented('AniListClient.getAnimeList');
  }

  /** Ver RF-18. */
  setPriority(_mediaId: number, _priority: Priority): Promise<void> {
    return notImplemented('AniListClient.setPriority');
  }
}
