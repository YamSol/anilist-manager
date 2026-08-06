import { describe, expect, it } from 'vitest';

import {
  applyFilter,
  computeFacets,
  EMPTY_FILTER,
  matchesFilter,
  normalizeText,
  type FilterState,
} from './filter.js';
import type { AnimeEntry } from './model.js';

function makeEntry(overrides: Partial<AnimeEntry> & Pick<AnimeEntry, 'id' | 'title'>): AnimeEntry {
  return {
    priority: 0,
    lists: [],
    status: null,
    format: null,
    genres: [],
    averageScore: null,
    episodes: null,
    progress: 0,
    season: null,
    seasonYear: null,
    coverImage: null,
    ...overrides,
  };
}

const FRIEREN = makeEntry({
  id: 1,
  title: "Frieren: Beyond Journey's End",
  priority: 1,
  lists: ['Assistindo', 'Favoritos'],
  status: 'CURRENT',
  format: 'TV',
  genres: ['Adventure', 'Drama', 'Fantasy'],
  averageScore: 91,
});

const JUJUTSU = makeEntry({
  id: 2,
  title: 'Jujutsu Kaisen',
  priority: 2,
  lists: ['Assistindo'],
  status: 'CURRENT',
  format: 'TV',
  genres: ['Action', 'Fantasy'],
  averageScore: 85,
});

const KOE = makeEntry({
  id: 3,
  title: 'Koe no Katachi',
  priority: 0,
  lists: ['Planejados'],
  status: 'PLANNING',
  format: 'MOVIE',
  genres: ['Drama'],
  averageScore: 89,
});

const SEM_SCORE = makeEntry({
  id: 4,
  title: 'Anime Obscuro',
  priority: 5,
  lists: ['Planejados'],
  status: 'PLANNING',
  format: 'OVA',
  genres: [],
  averageScore: null,
});

const CATALOGO = [FRIEREN, JUJUTSU, KOE, SEM_SCORE];

function filtro(overrides: Partial<FilterState>): FilterState {
  return { ...EMPTY_FILTER, ...overrides };
}

describe('normalizeText', () => {
  it('RF-14: derruba maiúsculas', () => {
    expect(normalizeText('Jujutsu Kaisen')).toBe('jujutsu kaisen');
  });

  it('RF-14: derruba acentos', () => {
    expect(normalizeText('Coração à Solta')).toBe('coracao a solta');
  });

  it('RF-14: trata composto e decomposto como o mesmo texto', () => {
    expect(normalizeText('é')).toBe(normalizeText('é'));
  });

  it('RF-14: apara espaços das pontas', () => {
    expect(normalizeText('  Bleach  ')).toBe('bleach');
  });

  it('RF-14: string vazia continua vazia', () => {
    expect(normalizeText('')).toBe('');
  });

  it('RF-14: preserva caracteres não latinos', () => {
    expect(normalizeText('葬送のフリーレン')).toBe('葬送のフリーレン');
  });
});

describe('matchesFilter', () => {
  it('RF-13: filtro vazio deixa tudo passar', () => {
    expect(applyFilter(CATALOGO, EMPTY_FILTER)).toEqual(CATALOGO);
  });

  it('RF-14: buscar "frieren" encontra "Frieren: Beyond Journey\'s End"', () => {
    expect(applyFilter(CATALOGO, filtro({ text: 'frieren' }))).toEqual([FRIEREN]);
  });

  it('RF-14: buscar "jujutsu" encontra "Jujutsu Kaisen"', () => {
    expect(applyFilter(CATALOGO, filtro({ text: 'JUJUTSU' }))).toEqual([JUJUTSU]);
  });

  it('RF-14: acento digitado na busca não impede o casamento', () => {
    expect(applyFilter(CATALOGO, filtro({ text: 'jüjütsú' }))).toEqual([JUJUTSU]);
  });

  it('RF-14: acento no título não impede a busca sem acento', () => {
    const cafe = makeEntry({ id: 9, title: 'Café Terrace' });

    expect(applyFilter([cafe], filtro({ text: 'cafe' }))).toEqual([cafe]);
  });

  it('RF-14: busca por trecho no meio do título', () => {
    expect(applyFilter(CATALOGO, filtro({ text: 'journey' }))).toEqual([FRIEREN]);
  });

  it('RF-14: texto só com espaços não restringe nada', () => {
    expect(applyFilter(CATALOGO, filtro({ text: '   ' }))).toEqual(CATALOGO);
  });

  it('RF-13: format=TV + priority=1 exige as duas condições (AND entre facetas)', () => {
    expect(applyFilter(CATALOGO, filtro({ formats: ['TV'], priorities: [1] }))).toEqual([FRIEREN]);
    expect(applyFilter(CATALOGO, filtro({ formats: ['MOVIE'], priorities: [1] }))).toEqual([]);
  });

  it('RF-13: dois valores na mesma faceta são OR', () => {
    expect(applyFilter(CATALOGO, filtro({ formats: ['MOVIE', 'OVA'] }))).toEqual([KOE, SEM_SCORE]);
  });

  it('RF-13: filtra por status', () => {
    expect(applyFilter(CATALOGO, filtro({ statuses: ['PLANNING'] }))).toEqual([KOE, SEM_SCORE]);
  });

  it('RF-13: filtra por prioridade, inclusive a 0', () => {
    expect(applyFilter(CATALOGO, filtro({ priorities: [0] }))).toEqual([KOE]);
  });

  it('RF-13: filtra por gênero — basta a entrada ter um dos selecionados', () => {
    expect(applyFilter(CATALOGO, filtro({ genres: ['Fantasy'] }))).toEqual([FRIEREN, JUJUTSU]);
    expect(applyFilter(CATALOGO, filtro({ genres: ['Action', 'Drama'] }))).toEqual([
      FRIEREN,
      JUJUTSU,
      KOE,
    ]);
  });

  it('RF-13: filtra por lista, respeitando a agregação de RF-10', () => {
    expect(applyFilter(CATALOGO, filtro({ lists: ['Favoritos'] }))).toEqual([FRIEREN]);
  });

  it('RF-13: entrada com format nulo só passa com a faceta de formato vazia', () => {
    const semFormato = makeEntry({ id: 10, title: 'Sem formato' });

    expect(matchesFilter(semFormato, EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(semFormato, filtro({ formats: ['TV'] }))).toBe(false);
    expect(matchesFilter(semFormato, filtro({ statuses: ['CURRENT'] }))).toBe(false);
  });

  it('RF-13: faixa de score respeita as duas pontas, inclusive', () => {
    expect(applyFilter(CATALOGO, filtro({ minScore: 89, maxScore: 91 }))).toEqual([FRIEREN, KOE]);
    expect(applyFilter(CATALOGO, filtro({ minScore: 90, maxScore: null }))).toEqual([FRIEREN]);
    expect(applyFilter(CATALOGO, filtro({ minScore: null, maxScore: 86 }))).toEqual([JUJUTSU]);
  });

  it('RF-13: sem averageScore, a entrada some assim que uma ponta é definida', () => {
    expect(applyFilter(CATALOGO, filtro({ minScore: 0 }))).not.toContain(SEM_SCORE);
    expect(applyFilter(CATALOGO, filtro({ maxScore: 100 }))).not.toContain(SEM_SCORE);
    expect(applyFilter(CATALOGO, EMPTY_FILTER)).toContain(SEM_SCORE);
  });

  it('RF-13: texto e facetas combinam', () => {
    expect(applyFilter(CATALOGO, filtro({ text: 'a', formats: ['MOVIE'] }))).toEqual([KOE]);
  });

  it('RF-13: applyFilter não muta a lista original', () => {
    const copia = [...CATALOGO];
    applyFilter(CATALOGO, filtro({ text: 'frieren' }));

    expect(CATALOGO).toEqual(copia);
  });
});

describe('computeFacets', () => {
  it('RF-15: conta quantas entradas há em cada valor', () => {
    const facets = computeFacets(CATALOGO);

    expect(facets.formats).toEqual([
      { value: 'TV', count: 2 },
      { value: 'MOVIE', count: 1 },
      { value: 'OVA', count: 1 },
    ]);
    expect(facets.statuses).toEqual([
      { value: 'CURRENT', count: 2 },
      { value: 'PLANNING', count: 2 },
    ]);
  });

  it('RF-15: gêneros vêm ordenados por contagem, desempatando pelo nome', () => {
    expect(computeFacets(CATALOGO).genres).toEqual([
      { value: 'Drama', count: 2 },
      { value: 'Fantasy', count: 2 },
      { value: 'Action', count: 1 },
      { value: 'Adventure', count: 1 },
    ]);
  });

  it('RF-15: listas contam cada anime uma vez por lista em que ele aparece', () => {
    expect(computeFacets(CATALOGO).lists).toEqual([
      { value: 'Assistindo', count: 2 },
      { value: 'Planejados', count: 2 },
      { value: 'Favoritos', count: 1 },
    ]);
  });

  it('RF-15 e RF-17: as prioridades saem 1..5 com o 0 no fim', () => {
    expect(computeFacets(CATALOGO).priorities).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 1 },
      { value: 5, count: 1 },
      { value: 0, count: 1 },
    ]);
  });

  it('RF-15: valor que ninguém tem não vira faceta', () => {
    const facets = computeFacets([JUJUTSU]);

    expect(facets.formats.map((f) => f.value)).toEqual(['TV']);
    expect(facets.statuses.map((f) => f.value)).toEqual(['CURRENT']);
  });

  it('RF-15: campo nulo não conta em faceta nenhuma', () => {
    const facets = computeFacets([makeEntry({ id: 1, title: 'Nulo' })]);

    expect(facets.formats).toEqual([]);
    expect(facets.statuses).toEqual([]);
    expect(facets.priorities).toEqual([{ value: 0, count: 1 }]);
  });

  it('RF-15: catálogo vazio produz todas as facetas vazias', () => {
    expect(computeFacets([])).toEqual({
      formats: [],
      statuses: [],
      priorities: [],
      genres: [],
      lists: [],
    });
  });
});
