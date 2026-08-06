/**
 * Cliente da API GraphQL do AniList. Ver §5.5 de docs/REQUIREMENTS.md.
 *
 * Toda dependência externa — fetch, relógio, sleep — é injetada (AD-04). É isso
 * que torna throttle e backoff testáveis sem esperar tempo real passar.
 */

import { AniListError, AuthError, GraphQLError, NetworkError, RateLimitError } from './errors.js';
import { normalizeCollection, type AnimeEntry, type Priority } from './model.js';
import {
  ANILIST_GRAPHQL_ENDPOINT,
  LIST_QUERY,
  UPDATE_PRIORITY_MUTATION,
  VIEWER_QUERY,
} from './queries.js';

import type { Fetcher } from './http.js';

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

/** Ver RNF-04: a cota do AniList é por minuto. */
const RATE_WINDOW_MS = 60_000;
const DEFAULT_REQUESTS_PER_MINUTE = 90;
const DEFAULT_MAX_RETRIES = 3;

/** Espera assumida quando o 429 vem sem `Retry-After`: a janela inteira. */
const DEFAULT_RETRY_AFTER_MS = RATE_WINDOW_MS;

/**
 * Converte o header `Retry-After` em milissegundos.
 *
 * O AniList manda segundos, mas a RFC 9110 também permite uma data HTTP e
 * proxies no caminho fazem uso disso — daí as duas leituras.
 */
function parseRetryAfter(header: string | null, now: number): number {
  if (header === null) return DEFAULT_RETRY_AFTER_MS;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) {
    // Um valor negativo ou zero significa "pode tentar já"; nunca negativo.
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - now);

  return DEFAULT_RETRY_AFTER_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extrai as mensagens do campo `errors` do corpo GraphQL, sem confiar na forma. */
function readGraphQLErrors(body: Record<string, unknown>): { message: string }[] {
  const raw = body.errors;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return (raw as unknown[]).map((item) => {
    if (isRecord(item) && typeof item.message === 'string') return { message: item.message };
    return { message: 'Erro desconhecido da API do AniList.' };
  });
}

export class AniListClient {
  readonly #token: string;
  readonly #fetcher: Fetcher;
  readonly #endpoint: string;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  readonly #maxRetries: number;
  readonly #requestsPerMinute: number;

  /** Instantes das requisições já disparadas dentro da janela corrente. */
  #window: number[] = [];

  /**
   * Serializa só a reserva de vaga no throttle. Sem essa fila, N chamadas
   * concorrentes leriam a mesma janela vazia e estourariam a cota juntas.
   */
  #gate: Promise<void> = Promise.resolve();

  constructor(options: AniListClientOptions) {
    this.#token = options.token;
    this.#endpoint = options.endpoint ?? ANILIST_GRAPHQL_ENDPOINT;
    this.#requestsPerMinute = options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#now = options.now ?? (() => Date.now());
    this.#sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));

    // O default é resolvido AQUI, no construtor, e não no escopo do módulo: em
    // ambiente sem fetch o erro aponta para quem construiu o cliente, e nenhum
    // import do core toca em global nenhum só por ser carregado (RNF-03).
    if (options.fetcher !== undefined) {
      this.#fetcher = options.fetcher;
    } else {
      const globalFetch: unknown = globalThis.fetch;
      if (typeof globalFetch !== 'function') {
        throw new AniListError(
          'Nenhum fetch disponível neste ambiente. Injete `fetcher` em AniListClientOptions (RNF-03).',
        );
      }
      // Chama via globalThis para não perder o binding.
      this.#fetcher = (url, init) => globalThis.fetch(url, init);
    }
  }

  /**
   * Reserva uma vaga na janela deslizante, dormindo se a cota já estourou.
   * Ver RNF-04.
   */
  async #acquireSlot(): Promise<void> {
    const reserva = this.#gate.then(async () => {
      this.#dropExpired();

      const oldest = this.#window[0];
      if (this.#window.length >= this.#requestsPerMinute && oldest !== undefined) {
        // Dorme até a requisição mais antiga sair da janela, liberando a vaga.
        const espera = RATE_WINDOW_MS - (this.#now() - oldest);
        if (espera > 0) await this.#sleep(espera);
        this.#dropExpired();
      }

      this.#window.push(this.#now());
    });

    // A fila não pode travar por causa de uma reserva que falhou.
    this.#gate = reserva.catch(() => undefined);
    return reserva;
  }

  #dropExpired(): void {
    const limite = this.#now() - RATE_WINDOW_MS;
    this.#window = this.#window.filter((instante) => instante > limite);
  }

  /**
   * Lança `AuthError` em 401, `RateLimitError` em 429 esgotado,
   * `GraphQLError` quando o corpo traz `errors`, `NetworkError` no resto.
   */
  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ query, variables: variables ?? {} });

    // `<=` porque maxRetries conta RETENTATIVAS: 3 retries = 4 idas à rede.
    for (let tentativa = 0; tentativa <= this.#maxRetries; tentativa++) {
      await this.#acquireSlot();

      let response: Response;
      try {
        response = await this.#fetcher(this.#endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.#token}`,
          },
          body,
        });
      } catch (cause) {
        // Falha de transporte costuma ser passageira; vale retentar.
        if (tentativa < this.#maxRetries) {
          await this.#sleep(this.#backoffMs(tentativa));
          continue;
        }
        throw new NetworkError('Não foi possível contatar a API do AniList.', { cause });
      }

      if (response.status === 401 || response.status === 403) {
        // Ver RF-05: a UI reage ao TIPO, deslogando e voltando ao login.
        throw new AuthError('Token inválido ou expirado. Faça login de novo.');
      }

      if (response.status === 429) {
        const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'), this.#now());
        if (tentativa < this.#maxRetries) {
          await this.#sleep(retryAfterMs);
          continue;
        }
        throw new RateLimitError(
          'Limite de requisições do AniList atingido. Tente de novo em instantes.',
          retryAfterMs,
        );
      }

      return this.#readBody<T>(response);
    }

    // Inalcançável: o laço só sai por return ou throw. Existe para o compilador.
    throw new NetworkError('Requisição ao AniList terminou sem resposta.');
  }

  /** Backoff exponencial simples para falha de rede: 1s, 2s, 4s… */
  #backoffMs(tentativa: number): number {
    return 1000 * 2 ** tentativa;
  }

  async #readBody<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new NetworkError(`A API do AniList respondeu HTTP ${String(response.status)}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new NetworkError('A resposta do AniList não é um JSON válido.', { cause });
    }

    if (!isRecord(payload)) {
      throw new GraphQLError('A resposta do AniList não tem o formato esperado.', []);
    }

    const errors = readGraphQLErrors(payload);
    if (errors.length > 0) {
      // A primeira mensagem é a que a UI mostra; o resto fica em `errors`.
      throw new GraphQLError(errors[0]?.message ?? 'Erro da API do AniList.', errors);
    }

    if (payload.data == null) {
      throw new GraphQLError('A API do AniList respondeu sem dados.', []);
    }

    return payload.data as T;
  }

  async getViewerId(): Promise<number> {
    const data = await this.request<unknown>(VIEWER_QUERY);
    const viewer = isRecord(data) && isRecord(data.Viewer) ? data.Viewer : null;
    const id = viewer?.id;

    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new GraphQLError('A API não devolveu o id do usuário autenticado.', []);
    }
    return id;
  }

  /** Ver RF-10, RF-11. Já devolve normalizado. */
  async getAnimeList(userId: number): Promise<AnimeEntry[]> {
    // `request` devolve o `data`; normalizeCollection aceita essa forma.
    const data = await this.request<unknown>(LIST_QUERY, { userId });
    return normalizeCollection(data);
  }

  /** Ver RF-18. */
  async setPriority(mediaId: number, priority: Priority): Promise<void> {
    await this.request<unknown>(UPDATE_PRIORITY_MUTATION, { mediaId, priority });
  }
}
