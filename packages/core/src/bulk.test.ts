import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { applyPlan, type BulkProgress } from './bulk.js';
import { AniListClient } from './client.js';
import { AniListError, AuthError, GraphQLError } from './errors.js';
import type { AnimeEntry, Priority } from './model.js';
import { planConversion, type ConversionPlan } from './priority.js';

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

function makeEntry(id: number, priority: Priority): AnimeEntry {
  return {
    id,
    title: `Anime ${String(id)}`,
    priority,
    lists: ['Assistindo'],
    status: 'CURRENT',
    format: 'TV',
    genres: [],
    averageScore: null,
    episodes: null,
    progress: 0,
    season: null,
    seasonYear: null,
    coverImage: null,
  };
}

/** Cinco entradas cujas prioridades todas mudam na conversão (nenhuma é 3 nem 0). */
function planoDeCinco(): ConversionPlan {
  const plan = planConversion([1, 2, 4, 5, 1].map((p, i) => makeEntry(i + 1, p as Priority)));
  expect(plan.changes).toHaveLength(5);
  return plan;
}

function makeClient(): AniListClient {
  return new AniListClient({
    token: 't',
    maxRetries: 0,
    sleep: async () => {
      await Promise.resolve();
    },
  });
}

/** Lê o mediaId do corpo da mutation, para o handler decidir quem falha. */
async function mediaIdDe(request: Request): Promise<number> {
  const body = (await request.json()) as { variables?: { mediaId?: number } };
  return body.variables?.mediaId ?? -1;
}

describe('applyPlan — caminho feliz', () => {
  it('RF-24: aplica todas as mudanças do plano e nada mais', async () => {
    const escritas: { mediaId: number; priority: number }[] = [];
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as {
          variables: { mediaId: number; priority: number };
        };
        escritas.push(body.variables);
        return HttpResponse.json({ data: { SaveMediaListEntry: { id: 1 } } });
      }),
    );

    const plan = planoDeCinco();
    const result = await applyPlan(makeClient(), plan);

    expect(result.applied).toHaveLength(5);
    expect(result.failed).toEqual([]);
    expect(result.aborted).toBe(false);
    expect(escritas).toEqual([
      { mediaId: 1, priority: 5 },
      { mediaId: 2, priority: 4 },
      { mediaId: 3, priority: 2 },
      { mediaId: 4, priority: 1 },
      { mediaId: 5, priority: 5 },
    ]);
  });

  it('RF-22: unchanged e skipped não geram escrita nenhuma', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        return HttpResponse.json({ data: {} });
      }),
    );

    // Só prioridades 3 (inalterada) e 0 (ignorada).
    const plan = planConversion([makeEntry(1, 3), makeEntry(2, 0)]);
    const result = await applyPlan(makeClient(), plan);

    expect(chamadas).toBe(0);
    expect(result.applied).toEqual([]);
    expect(result.aborted).toBe(false);
  });

  it('RF-24: plano sem mudanças resolve imediatamente', async () => {
    const result = await applyPlan(makeClient(), planConversion([]));

    expect(result).toEqual({ applied: [], failed: [], aborted: false });
  });
});

describe('applyPlan — falhas individuais (RF-25)', () => {
  it('RF-25: com a 2ª de 5 falhando, 4 são aplicadas e 1 aparece em failed', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        if ((await mediaIdDe(request)) === 2) {
          return HttpResponse.json({ errors: [{ message: 'Rejeitado pelo AniList' }] });
        }
        return HttpResponse.json({ data: { SaveMediaListEntry: { id: 1 } } });
      }),
    );

    const result = await applyPlan(makeClient(), planoDeCinco());

    expect(result.applied.map((c) => c.id)).toEqual([1, 3, 4, 5]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.change.id).toBe(2);
    expect(result.failed[0]?.error).toBeInstanceOf(GraphQLError);
    expect(result.aborted).toBe(false);
  });

  it('RF-25: a falha carrega a mudança inteira, para a UI poder oferecer retry', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) =>
        (await mediaIdDe(request)) === 3
          ? HttpResponse.json({ errors: [{ message: 'Falhou' }] })
          : HttpResponse.json({ data: {} }),
      ),
    );

    const result = await applyPlan(makeClient(), planoDeCinco());

    expect(result.failed[0]?.change).toEqual({ id: 3, title: 'Anime 3', from: 4, to: 2 });
  });

  it('RF-25: erro de autenticação no meio também não aborta o lote', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) =>
        (await mediaIdDe(request)) === 2
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ data: {} }),
      ),
    );

    const result = await applyPlan(makeClient(), planoDeCinco());

    expect(result.applied).toHaveLength(4);
    expect(result.failed[0]?.error).toBeInstanceOf(AuthError);
  });

  it('RF-25: todas falhando devolve applied vazio e failed cheio', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ errors: [{ message: 'Nope' }] })));

    const result = await applyPlan(makeClient(), planoDeCinco());

    expect(result.applied).toEqual([]);
    expect(result.failed).toHaveLength(5);
    expect(result.aborted).toBe(false);
  });

  it('RF-25: erro que não é do domínio é embrulhado em AniListError', async () => {
    const clienteQuebrado = {
      setPriority: () => Promise.reject(new TypeError('boom')),
    } as unknown as AniListClient;

    const result = await applyPlan(clienteQuebrado, planoDeCinco());

    expect(result.failed).toHaveLength(5);
    expect(result.failed[0]?.error).toBeInstanceOf(AniListError);
    expect(result.failed[0]?.error.message).toContain('boom');
  });

  it('RF-25: rejeição que nem Error é vira AniListError com o valor no texto', async () => {
    const clienteQuebrado = {
      // Rejeitar com valor cru é justamente o que se quer provar aqui: applyPlan
      // precisa embrulhar qualquer coisa num AniListError, não só Error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      setPriority: () => Promise.reject('string crua'),
    } as unknown as AniListClient;

    const result = await applyPlan(clienteQuebrado, planoDeCinco());

    expect(result.failed[0]?.error).toBeInstanceOf(AniListError);
    expect(result.failed[0]?.error.message).toContain('string crua');
  });
});

describe('applyPlan — cancelamento (RF-24)', () => {
  it('RF-24: abortar no meio interrompe o lote e marca aborted', async () => {
    const controller = new AbortController();
    let chamadas = 0;

    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 2) controller.abort();
        return HttpResponse.json({ data: {} });
      }),
    );

    const result = await applyPlan(makeClient(), planoDeCinco(), { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(chamadas).toBe(2);
    // RF-24: as duas já aplicadas permanecem aplicadas.
    expect(result.applied.map((c) => c.id)).toEqual([1, 2]);
  });

  it('RF-24: signal já abortado antes de começar não escreve nada', async () => {
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        return HttpResponse.json({ data: {} });
      }),
    );

    const result = await applyPlan(makeClient(), planoDeCinco(), {
      signal: AbortSignal.abort(),
    });

    expect(chamadas).toBe(0);
    expect(result.aborted).toBe(true);
    expect(result.applied).toEqual([]);
  });

  it('RF-24: signal que nunca aborta deixa aborted em false', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: {} })));

    const result = await applyPlan(makeClient(), planoDeCinco(), {
      signal: new AbortController().signal,
    });

    expect(result.aborted).toBe(false);
    expect(result.applied).toHaveLength(5);
  });

  it('RF-24 e RF-25: abortar depois de uma falha preserva a falha no resultado', async () => {
    const controller = new AbortController();
    let chamadas = 0;

    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 1) return HttpResponse.json({ errors: [{ message: 'Falhou' }] });
        controller.abort();
        return HttpResponse.json({ data: {} });
      }),
    );

    const result = await applyPlan(makeClient(), planoDeCinco(), { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(result.failed).toHaveLength(1);
    expect(result.applied).toHaveLength(1);
  });
});

describe('applyPlan — progresso (RF-24)', () => {
  it('RF-24: onProgress é chamado a cada passo e uma última vez no fim', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: {} })));

    const eventos: BulkProgress[] = [];
    const onProgress = vi.fn((p: BulkProgress) => eventos.push(p));

    await applyPlan(makeClient(), planoDeCinco(), { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(6); // 5 passos + o fechamento
    expect(eventos.map((e) => e.done)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(eventos.map((e) => e.current?.id ?? null)).toEqual([1, 2, 3, 4, 5, null]);
    expect(eventos.every((e) => e.total === 5)).toBe(true);
  });

  it('RF-24: o progresso final fecha em done === total', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: {} })));

    const eventos: BulkProgress[] = [];
    await applyPlan(makeClient(), planoDeCinco(), {
      onProgress: (p) => eventos.push(p),
    });

    const ultimo = eventos.at(-1);
    expect(ultimo?.done).toBe(ultimo?.total);
    expect(ultimo?.current).toBeNull();
  });

  it('RF-25: o progresso acumula as falhas conforme elas acontecem', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) =>
        (await mediaIdDe(request)) <= 2
          ? HttpResponse.json({ errors: [{ message: 'Falhou' }] })
          : HttpResponse.json({ data: {} }),
      ),
    );

    const eventos: BulkProgress[] = [];
    await applyPlan(makeClient(), planoDeCinco(), {
      onProgress: (p) => eventos.push(p),
    });

    // O evento é emitido ANTES da escrita, então a falha da vez só aparece no
    // evento seguinte. As duas primeiras falham; da 3ª em diante o total fica em 2.
    expect(eventos.map((e) => e.failed.length)).toEqual([0, 1, 2, 2, 2, 2]);
  });

  it('RF-25: cada evento recebe uma cópia de failed, não a lista viva', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ errors: [{ message: 'x' }] })));

    const eventos: BulkProgress[] = [];
    await applyPlan(makeClient(), planoDeCinco(), {
      onProgress: (p) => eventos.push(p),
    });

    // Se fosse a mesma referência, o primeiro evento teria as 5 falhas no fim.
    expect(eventos[0]?.failed).toEqual([]);
    expect(eventos.at(-1)?.failed).toHaveLength(5);
  });

  it('RF-24: o progresso é emitido mesmo quando o lote é abortado', async () => {
    const controller = new AbortController();
    let chamadas = 0;
    server.use(
      http.post(ENDPOINT, () => {
        chamadas++;
        if (chamadas === 1) controller.abort();
        return HttpResponse.json({ data: {} });
      }),
    );

    const eventos: BulkProgress[] = [];
    await applyPlan(makeClient(), planoDeCinco(), {
      signal: controller.signal,
      onProgress: (p) => eventos.push(p),
    });

    expect(eventos.at(-1)?.current).toBeNull();
    expect(eventos.at(-1)?.done).toBe(1);
  });

  it('RF-24: sem onProgress, o lote roda igual', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: {} })));

    await expect(applyPlan(makeClient(), planoDeCinco())).resolves.toMatchObject({
      applied: expect.any(Array),
    });
  });
});
