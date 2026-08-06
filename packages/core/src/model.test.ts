import { describe, expect, it } from 'vitest';

import { AniListError } from './errors.js';
import { normalizeCollection, pickTitle } from './model.js';

describe('pickTitle', () => {
  it('RF-12: prefere english quando os três títulos existem', () => {
    expect(
      pickTitle({ english: 'Frieren', romaji: 'Sousou no Frieren', native: '葬送のフリーレン' }),
    ).toBe('Frieren');
  });

  it('RF-12: cai para romaji quando english é nulo', () => {
    expect(
      pickTitle({ english: null, romaji: 'Sousou no Frieren', native: '葬送のフリーレン' }),
    ).toBe('Sousou no Frieren');
  });

  it('RF-12: cai para native quando english e romaji são nulos', () => {
    expect(pickTitle({ english: null, romaji: null, native: '葬送のフリーレン' })).toBe(
      '葬送のフリーレン',
    );
  });

  it('RF-12: trata string vazia e só-espaços como título ausente', () => {
    expect(pickTitle({ english: '   ', romaji: '', native: 'ナルト' })).toBe('ナルト');
  });

  it('RF-12: apara espaços do título escolhido', () => {
    expect(pickTitle({ english: '  Bleach  ' })).toBe('Bleach');
  });

  it('RF-12: lança AniListError quando os três títulos são nulos', () => {
    expect(() => pickTitle({ english: null, romaji: null, native: null })).toThrow(AniListError);
  });

  it('RF-12: lança AniListError quando o fragmento vem vazio', () => {
    expect(() => pickTitle({})).toThrow(AniListError);
  });
});

/** Monta uma resposta no formato da LIST_QUERY, com wrapper `data`. */
function response(lists: unknown[]): unknown {
  return { data: { MediaListCollection: { lists } } };
}

function entry(mediaId: number, overrides: Record<string, unknown> = {}): unknown {
  return {
    mediaId,
    priority: 3,
    status: 'CURRENT',
    progress: 12,
    media: {
      title: { english: `Anime ${String(mediaId)}`, romaji: null, native: null },
      format: 'TV',
      genres: ['Action'],
      averageScore: 84,
      episodes: 24,
      season: 'FALL',
      seasonYear: 2023,
      coverImage: { medium: 'https://img/1.jpg' },
    },
    ...overrides,
  };
}

describe('normalizeCollection', () => {
  it('RF-11: mapeia todos os campos da LIST_QUERY', () => {
    const [result] = normalizeCollection(response([{ name: 'Assistindo', entries: [entry(1)] }]));

    expect(result).toEqual({
      id: 1,
      title: 'Anime 1',
      priority: 3,
      lists: ['Assistindo'],
      status: 'CURRENT',
      format: 'TV',
      genres: ['Action'],
      averageScore: 84,
      episodes: 24,
      progress: 12,
      season: 'FALL',
      seasonYear: 2023,
      coverImage: 'https://img/1.jpg',
    });
  });

  it('RF-10: um anime em três listas vira uma linha com as três listas agregadas', () => {
    const result = normalizeCollection(
      response([
        { name: 'Assistindo', entries: [entry(7)] },
        { name: 'Favoritos', entries: [entry(7)] },
        { name: 'Rewatch', entries: [entry(7)] },
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.lists).toEqual(['Assistindo', 'Favoritos', 'Rewatch']);
  });

  it('RF-10: preserva a ordem de aparição dos animes', () => {
    const result = normalizeCollection(
      response([
        { name: 'A', entries: [entry(30), entry(10)] },
        { name: 'B', entries: [entry(20), entry(30)] },
      ]),
    );

    expect(result.map((e) => e.id)).toEqual([30, 10, 20]);
  });

  it('RF-10: não repete o mesmo nome de lista para o mesmo anime', () => {
    const result = normalizeCollection(
      response([{ name: 'Assistindo', entries: [entry(5), entry(5)] }]),
    );

    expect(result[0]?.lists).toEqual(['Assistindo']);
  });

  it('RF-12: usa romaji quando english é nulo e native quando ambos são nulos', () => {
    const result = normalizeCollection(
      response([
        {
          name: 'L',
          entries: [
            entry(1, { media: { title: { english: null, romaji: 'Romaji Um' } } }),
            entry(2, { media: { title: { english: null, romaji: null, native: 'ネイティブ' } } }),
          ],
        },
      ]),
    );

    expect(result.map((e) => e.title)).toEqual(['Romaji Um', 'ネイティブ']);
  });

  it('RF-12: sem nenhum título usável, rotula com o mediaId em vez de derrubar a lista', () => {
    const result = normalizeCollection(
      response([{ name: 'L', entries: [entry(99, { media: { title: {} } })] }]),
    );

    expect(result[0]?.title).toBe('#99');
  });

  it('RF-11: campos ausentes viram null, sem estourar', () => {
    const result = normalizeCollection(response([{ name: 'L', entries: [{ mediaId: 42 }] }]));

    expect(result[0]).toEqual({
      id: 42,
      title: '#42',
      priority: 0,
      lists: ['L'],
      status: null,
      format: null,
      genres: [],
      averageScore: null,
      episodes: null,
      progress: 0,
      season: null,
      seasonYear: null,
      coverImage: null,
    });
  });

  it('RF-11: descarta valores fora do domínio de format, status e season', () => {
    const result = normalizeCollection(
      response([
        {
          name: 'L',
          entries: [
            entry(1, {
              status: 'INVENTADO',
              media: { title: { english: 'X' }, format: 'MANGA', season: 'MONSOON' },
            }),
          ],
        },
      ]),
    );

    expect(result[0]).toMatchObject({ status: null, format: null, season: null });
  });

  it('RF-11: prioridade fora de 1..5 ou não inteira colapsa em 0', () => {
    const result = normalizeCollection(
      response([
        {
          name: 'L',
          entries: [
            entry(1, { priority: null }),
            entry(2, { priority: 9 }),
            entry(3, { priority: 2.5 }),
            entry(4, { priority: '4' }),
          ],
        },
      ]),
    );

    expect(result.map((e) => e.priority)).toEqual([0, 0, 0, 0]);
  });

  it('RF-11: aceita coverImage.large quando medium não vem', () => {
    const result = normalizeCollection(
      response([
        {
          name: 'L',
          entries: [
            entry(1, { media: { title: { english: 'X' }, coverImage: { large: 'g.jpg' } } }),
          ],
        },
      ]),
    );

    expect(result[0]?.coverImage).toBe('g.jpg');
  });

  it('RF-11: ignora gêneros que não são texto', () => {
    const result = normalizeCollection(
      response([
        {
          name: 'L',
          entries: [
            entry(1, { media: { title: { english: 'X' }, genres: ['Action', 3, null, ''] } }),
          ],
        },
      ]),
    );

    expect(result[0]?.genres).toEqual(['Action']);
  });

  it('RF-10: aceita o payload já desembrulhado do wrapper data', () => {
    const result = normalizeCollection({
      MediaListCollection: { lists: [{ name: 'L', entries: [entry(1)] }] },
    });

    expect(result).toHaveLength(1);
  });

  it('RF-10: aceita a coleção crua, sem MediaListCollection', () => {
    const result = normalizeCollection({ lists: [{ name: 'L', entries: [entry(1)] }] });

    expect(result).toHaveLength(1);
  });

  it('RF-10: lista sem nome não contribui com nome nenhum em lists', () => {
    const result = normalizeCollection(response([{ entries: [entry(1)] }]));

    expect(result[0]?.lists).toEqual([]);
  });

  it('RF-10: descarta entrada sem mediaId numérico inteiro', () => {
    const result = normalizeCollection(
      response([
        { name: 'L', entries: [{ mediaId: 'abc' }, { mediaId: 1.5 }, null, 'lixo', entry(1)] },
      ]),
    );

    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'não é um payload'],
    ['array', [1, 2, 3]],
    ['objeto vazio', {}],
    ['lists não-array', { lists: 'x' }],
    ['data nulo', { data: null }],
  ])('RF-10: entrada inválida (%s) devolve lista vazia', (_nome, raw) => {
    expect(normalizeCollection(raw)).toEqual([]);
  });

  it('RF-10: ignora itens de lists que não são objetos e entries que não é array', () => {
    expect(normalizeCollection(response([null, 42, { name: 'L', entries: 'x' }]))).toEqual([]);
  });
});
