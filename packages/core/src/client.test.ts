import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AniListClient } from './client.js';
import { AniListError, AuthError, GraphQLError, NetworkError, RateLimitError } from './errors.js';

const ENDPOINT = 'https://graphql.anilist.co';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

/**
 * Relógio e sleep falsos: o sleep não espera, só empurra o relógio.
 * É o que mantém os testes de throttle e de backoff abaixo de 1s reais (AD-04).
 */
function fakeClock() {
  let agora = 0;
  const sleep = vi.fn(async (ms: number) => {
    agora += ms;
    await Promise.resolve();
  });
  return { sleep, now: () => agora, avancar: (ms: number) => (agora += ms) };
}

function makeClient(overrides: Partial<ConstructorParameters<typeof AniListClient>[0]> = {}) {
  const clock = fakeClock();
  const client = new AniListClient({
    token: 'token-de-teste',
    sleep: clock.sleep,
    now: clock.now,
    maxRetries: 1,
    ...overrides,
  });
  return { client, clock };
}

describe('AniListClient.request — caminho feliz', () => {
  it('RF-05: devolve o data do corpo GraphQL', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { Viewer: { id: 7 } } })));

    const { client } = makeClient();

    await expect(client.request('query { Viewer { id } }')).resolves.toEqual({ Viewer: { id: 7 } });
  });

  it('RF-05: envia o token no header Authorization e a query no corpo', async () => {
    const capturado: { auth: string | null; body: unknown } = { auth: null, body: null };
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        capturado.auth = request.headers.get('Authorization');
        capturado.body = await request.json();
        return HttpResponse.json({ data: { ok: true } });
      }),
    );

    const { client } = makeClient();
    await client.request('query X { a }', { userId: 42 });

    expect(capturado.auth).toBe('Bearer token-de-teste');
    expect(capturado.body).toEqual({ query: 'query X { a }', variables: { userId: 42 } });
  });

  it('RF-05: sem variáveis, manda um objeto vazio em vez de undefined', async () => {
    let body: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: {} });
      }),
    );

    const { client } = makeClient();
    await client.request('query { a }');

    expect(body).toEqual({ query: 'query { a }', variables: {} });
  });

  it('RNF-03: respeita o endpoint injetado, sem falar com o AniList de verdade', async () => {
    server.use(http.post('https://exemplo.test/gql', () => HttpResponse.json({ data: { a: 1 } })));

    const { client } = makeClient({ endpoint: 'https://exemplo.test/gql' });

    await expect(client.request('query { a }')).resolves.toEqual({ a: 1 });
  });
});

describe('AniListClient.request — mapeamento de erro', () => {
  it('RF-05: corpo com errors vira GraphQLError com todas as mensagens', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: 'Invalid token' }, { message: 'Not found' }],
        }),
      ),
    );

    const { client } = makeClient();
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(GraphQLError);
    expect(erro).toBeInstanceOf(AniListError);
    expect((erro as GraphQLError).message).toBe('Invalid token');
    expect((erro as GraphQLError).errors).toEqual([
      { message: 'Invalid token' },
      { message: 'Not found' },
    ]);
  });

  it('RF-05: errors com item sem message não quebra o mapeamento', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ errors: [{ codigo: 500 }] })));

    const { client } = makeClient();
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(GraphQLError);
    expect((erro as GraphQLError).errors).toHaveLength(1);
  });

  it('RF-05: HTTP 401 vira AuthError', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 401 })));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(AuthError);
  });

  it('RF-05: HTTP 403 também vira AuthError', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 403 })));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(AuthError);
  });

  it('RF-05: 401 não é retentado — token ruim não melhora com insistência', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const { client } = makeClient({ maxRetries: 3 });
    await expect(client.request('query { a }')).rejects.toBeInstanceOf(AuthError);

    expect(chamadas).toBe(1);
  });

  it('RF-05: HTTP 500 vira NetworkError', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 500 })));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(NetworkError);
  });

  it('RF-05: corpo que não é JSON vira NetworkError', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse('<html>oops</html>', { status: 200 })));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(NetworkError);
  });

  it('RF-05: 200 sem data e sem errors vira GraphQLError', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: null })));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(GraphQLError);
  });

  it('RF-05: corpo que não é objeto vira GraphQLError', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json([1, 2, 3])));

    const { client } = makeClient();

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(GraphQLError);
  });

  it('RF-05: falha de rede vira NetworkError depois de esgotar as retentativas', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        return HttpResponse.error();
      }),
    );

    const { client } = makeClient({ maxRetries: 2 });

    await expect(client.request('query { a }')).rejects.toBeInstanceOf(NetworkError);
    expect(chamadas).toBe(3); // 1 tentativa + 2 retentativas
  });

  it('RF-05: falha de rede passageira é retentada e a segunda ida dá certo', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 1) return HttpResponse.error();
        return HttpResponse.json({ data: { ok: true } });
      }),
    );

    const { client, clock } = makeClient();

    await expect(client.request('query { a }')).resolves.toEqual({ ok: true });
    expect(chamadas).toBe(2);
    expect(clock.sleep).toHaveBeenCalledWith(1000);
  });
});

describe('AniListClient — rate limit (RNF-04)', () => {
  it('RNF-04: 429 com Retry-After dorme o tempo pedido e depois tem sucesso', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 1) {
          return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '7' } });
        }
        return HttpResponse.json({ data: { ok: true } });
      }),
    );

    const { client, clock } = makeClient();

    await expect(client.request('query { a }')).resolves.toEqual({ ok: true });
    expect(clock.sleep).toHaveBeenCalledWith(7000);
    expect(chamadas).toBe(2);
  });

  it('RNF-04: 429 persistente vira RateLimitError depois de esgotar maxRetries', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '3' } });
      }),
    );

    const { client } = makeClient({ maxRetries: 2 });
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(RateLimitError);
    expect((erro as RateLimitError).retryAfterMs).toBe(3000);
    expect(chamadas).toBe(3);
  });

  it('RNF-04: 429 sem Retry-After assume a janela inteira de 60s', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 429 })));

    const { client } = makeClient({ maxRetries: 0 });
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect((erro as RateLimitError).retryAfterMs).toBe(60_000);
  });

  it('RNF-04: Retry-After em data HTTP é convertido para milissegundos', async () => {
    const daquiA30s = new Date(Date.now() + 30_000).toUTCString();
    server.use(
      http.post(
        ENDPOINT,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': daquiA30s } }),
      ),
    );

    // Aqui o relógio precisa ser o real: a data do header é absoluta.
    const client = new AniListClient({
      token: 't',
      maxRetries: 0,
      sleep: async () => {
        await Promise.resolve();
      },
    });
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect((erro as RateLimitError).retryAfterMs).toBeGreaterThan(25_000);
    expect((erro as RateLimitError).retryAfterMs).toBeLessThanOrEqual(30_000);
  });

  it('RNF-04: Retry-After ilegível cai no padrão de 60s', async () => {
    server.use(
      http.post(
        ENDPOINT,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': 'amanhã' } }),
      ),
    );

    const { client } = makeClient({ maxRetries: 0 });
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect((erro as RateLimitError).retryAfterMs).toBe(60_000);
  });

  it('RNF-04: Retry-After negativo não vira espera negativa', async () => {
    server.use(
      http.post(
        ENDPOINT,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '-5' } }),
      ),
    );

    const { client } = makeClient({ maxRetries: 0 });
    const erro = await client.request('query { a }').catch((e: unknown) => e);

    expect((erro as RateLimitError).retryAfterMs).toBe(0);
  });
});

describe('AniListClient — throttle (RNF-04)', () => {
  it('RNF-04: dentro da cota, nenhuma requisição espera', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { ok: true } })));

    const { client, clock } = makeClient({ requestsPerMinute: 3 });
    await client.request('query { a }');
    await client.request('query { a }');
    await client.request('query { a }');

    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('RNF-04: estourada a cota da janela, a próxima espera o resto do minuto', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { ok: true } })));

    const { client, clock } = makeClient({ requestsPerMinute: 2 });
    await client.request('query { a }');
    await client.request('query { a }');

    expect(clock.sleep).not.toHaveBeenCalled();

    await client.request('query { a }');

    expect(clock.sleep).toHaveBeenCalledExactlyOnceWith(60_000);
  });

  it('RNF-04: requisições velhas saem da janela e liberam a vaga sem espera', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { ok: true } })));

    const { client, clock } = makeClient({ requestsPerMinute: 2 });
    await client.request('query { a }');
    await client.request('query { a }');

    clock.avancar(61_000);
    await client.request('query { a }');

    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('RNF-04: chamadas concorrentes não furam a cota juntas', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { ok: true } })));

    const { client, clock } = makeClient({ requestsPerMinute: 2 });
    await Promise.all([
      client.request('query { a }'),
      client.request('query { a }'),
      client.request('query { a }'),
      client.request('query { a }'),
    ]);

    // Sem a fila de reserva, as quatro leriam a janela vazia ao mesmo tempo e
    // nenhuma dormiria. Com ela, a 3ª espera a janela virar -- e, como o
    // relógio falso avança 60s nessa espera, a 4ª já encontra a janela limpa.
    expect(clock.sleep).toHaveBeenCalledExactlyOnceWith(60_000);
  });

  it('RNF-04: o default de 90 req/min só morde a partir da 91ª', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { ok: true } })));

    const { client, clock } = makeClient();
    for (let i = 0; i < 90; i++) {
      await client.request('query { a }');
    }

    expect(clock.sleep).not.toHaveBeenCalled();

    await client.request('query { a }');

    expect(clock.sleep).toHaveBeenCalledOnce();
  });
});

describe('AniListClient — operações de domínio', () => {
  it('RF-05: getViewerId devolve o id do usuário autenticado', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { Viewer: { id: 1234 } } })));

    const { client } = makeClient();

    await expect(client.getViewerId()).resolves.toBe(1234);
  });

  it.each([
    ['sem Viewer', { data: {} }],
    ['Viewer nulo', { data: { Viewer: null } }],
    ['id não numérico', { data: { Viewer: { id: 'abc' } } }],
    ['id fracionário', { data: { Viewer: { id: 1.5 } } }],
  ])('RF-05: getViewerId com resposta %s vira GraphQLError', async (_nome, body) => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json(body)));

    const { client } = makeClient();

    await expect(client.getViewerId()).rejects.toBeInstanceOf(GraphQLError);
  });

  it('RF-10 e RF-11: getAnimeList devolve as entradas já normalizadas e deduplicadas', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: [
                {
                  name: 'Assistindo',
                  entries: [
                    {
                      mediaId: 1,
                      priority: 2,
                      status: 'CURRENT',
                      progress: 3,
                      media: { title: { english: 'Bleach' }, format: 'TV', genres: ['Action'] },
                    },
                  ],
                },
                { name: 'Favoritos', entries: [{ mediaId: 1, priority: 2 }] },
              ],
            },
          },
        }),
      ),
    );

    const { client } = makeClient();
    const entries = await client.getAnimeList(99);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 1,
      title: 'Bleach',
      priority: 2,
      lists: ['Assistindo', 'Favoritos'],
    });
  });

  it('RF-10: getAnimeList manda o userId como variável', async () => {
    let body: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { MediaListCollection: { lists: [] } } });
      }),
    );

    const { client } = makeClient();
    await client.getAnimeList(4242);

    expect(body).toMatchObject({ variables: { userId: 4242 } });
  });

  it('RF-18: setPriority dispara a mutation com mediaId e priority', async () => {
    let body: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { SaveMediaListEntry: { id: 1, priority: 4 } } });
      }),
    );

    const { client } = makeClient();

    await expect(client.setPriority(555, 4)).resolves.toBeUndefined();
    expect(body).toMatchObject({ variables: { mediaId: 555, priority: 4 } });
  });

  it('RF-18: erro na mutation propaga o tipo, sem corromper nada', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ errors: [{ message: 'Not authorized' }] })),
    );

    const { client } = makeClient();

    await expect(client.setPriority(1, 3)).rejects.toBeInstanceOf(GraphQLError);
  });
});

describe('AniListClient — construção', () => {
  it('RNF-03: sem fetch no ambiente e sem fetcher injetado, lança AniListError', () => {
    const fetchOriginal = globalThis.fetch;
    // @ts-expect-error simula um ambiente sem fetch para provar a mensagem de RNF-03
    delete globalThis.fetch;

    try {
      expect(() => new AniListClient({ token: 't' })).toThrow(AniListError);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('RNF-03: com fetch no ambiente, o cliente constrói sem fetcher injetado', () => {
    expect(() => new AniListClient({ token: 't' })).not.toThrow();
  });

  it('RNF-04: sem sleep injetado, o backoff usa setTimeout e não trava o retry', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 1) {
          // Retry-After: 0 exercita o sleep real sem custar tempo de teste.
          return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } });
        }
        return HttpResponse.json({ data: { ok: true } });
      }),
    );

    const client = new AniListClient({ token: 't', maxRetries: 1 });

    await expect(client.request('query { a }')).resolves.toEqual({ ok: true });
    expect(chamadas).toBe(2);
  });

  it('RNF-03: o fetcher injetado é usado no lugar do global', async () => {
    const fetcher = vi.fn(async (): Promise<Response> =>
      Promise.resolve(Response.json({ data: { ok: true } })),
    );

    const { client } = makeClient({ fetcher });

    await expect(client.request('query { a }')).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
