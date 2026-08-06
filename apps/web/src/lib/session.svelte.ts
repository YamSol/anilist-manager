/**
 * Sessão da aplicação: o cliente autenticado e a coleção carregada.
 *
 * É o único lugar que fala com a rede. As telas recebem `entries` já
 * normalizadas pelo core e devolvem intenções (`refresh`, `updatePriority`).
 */

import { AniListClient, type AnimeEntry, type Priority } from '@anilist-updater/core';
import { browserFetcher } from './fetcher.js';
import { errorMessage } from './labels.js';

export interface SessionDeps {
  /** Injetável para os testes; em produção é sempre o cliente real. */
  readonly createClient?: (token: string) => AniListClient;
  /** Chamado quando a API responde 401 (RF-05): a UI desloga e volta ao login. */
  readonly onAuthError?: (message: string) => void;
}

function defaultClient(token: string): AniListClient {
  return new AniListClient({ token, fetcher: browserFetcher });
}

export function createSession(deps: SessionDeps = {}) {
  const createClient = deps.createClient ?? defaultClient;

  let entries = $state<AnimeEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loadedAt = $state<number | null>(null);

  function handle(cause: unknown): void {
    if (cause instanceof Error && cause.name === 'AuthError') {
      // Ver RF-05: 401 nunca vira tela em branco; volta para o login com motivo.
      deps.onAuthError?.(errorMessage(cause));
    }
    error = errorMessage(cause);
  }

  return {
    get entries(): AnimeEntry[] {
      return entries;
    },
    get loading(): boolean {
      return loading;
    },
    get error(): string | null {
      return error;
    },
    get loadedAt(): number | null {
      return loadedAt;
    },

    clearError(): void {
      error = null;
    },

    reset(): void {
      entries = [];
      loadedAt = null;
      error = null;
    },

    /** Ver RF-10 e RF-11. O core já devolve a coleção deduplicada e normalizada. */
    async refresh(token: string): Promise<void> {
      loading = true;
      error = null;
      try {
        const client = createClient(token);
        const userId = await client.getViewerId();
        entries = await client.getAnimeList(userId);
        loadedAt = Date.now();
      } catch (cause) {
        handle(cause);
      } finally {
        loading = false;
      }
    },

    /**
     * Ver RF-18. Atualização otimista **não** é usada: o valor exibido só muda
     * depois do sucesso, para que um erro não deixe a tela mentindo.
     */
    async updatePriority(token: string, mediaId: number, priority: Priority): Promise<void> {
      const client = createClient(token);
      await client.setPriority(mediaId, priority);
      entries = entries.map((entry) => (entry.id === mediaId ? { ...entry, priority } : entry));
    },
  };
}

export type Session = ReturnType<typeof createSession>;
