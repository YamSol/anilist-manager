/**
 * Filtro facetado e busca textual. Ver §5.6 de docs/REQUIREMENTS.md.
 *
 * Tudo aqui é função pura sobre `AnimeEntry[]` — nenhuma consulta à rede,
 * nenhum estado. O filtro é AND entre facetas e OR dentro de cada faceta.
 */

import {
  ALL_LIST_STATUSES,
  ALL_MEDIA_FORMATS,
  type AnimeEntry,
  type ListStatus,
  type MediaFormat,
  type Priority,
} from './model.js';
import { ALL_PRIORITIES, comparePriority } from './priority.js';

/** Facetas de prioridade seguem a mesma ordem da coluna: 1..5 e o 0 no fim (RF-17). */
const PRIORITY_FACET_ORDER: readonly Priority[] = Object.freeze(
  [...ALL_PRIORITIES].sort(comparePriority),
);

export interface FilterState {
  readonly text: string;
  readonly formats: readonly MediaFormat[];
  readonly statuses: readonly ListStatus[];
  readonly priorities: readonly Priority[];
  readonly genres: readonly string[];
  readonly lists: readonly string[];
  readonly minScore: number | null;
  readonly maxScore: number | null;
}

export const EMPTY_FILTER: FilterState = Object.freeze({
  text: '',
  formats: Object.freeze([]),
  statuses: Object.freeze([]),
  priorities: Object.freeze([]),
  genres: Object.freeze([]),
  lists: Object.freeze([]),
  minScore: null,
  maxScore: null,
});

/**
 * NFD separa a letra do diacrítico; U+0300–U+036F é o bloco dos diacríticos
 * combinantes, que então some. Escrito com escape para o range continuar
 * legível — os caracteres em si são invisíveis no editor.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Ver RF-14. Minúsculas e sem acentos, para busca insensível a ambos. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

/**
 * Faceta vazia não restringe nada; faceta preenchida é OR entre seus valores.
 * Entrada com o campo `null` só passa quando a faceta está vazia.
 */
function matchesEnumFacet<T>(selected: readonly T[], value: T | null): boolean {
  if (selected.length === 0) return true;
  return value !== null && selected.includes(value);
}

/** OR dentro da faceta: basta uma interseção entre o selecionado e o da entrada. */
function matchesMultiFacet(selected: readonly string[], values: readonly string[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((wanted) => values.includes(wanted));
}

/** Ver RF-13. Faceta vazia não restringe nada. */
export function matchesFilter(entry: AnimeEntry, filter: FilterState): boolean {
  const needle = normalizeText(filter.text);
  if (needle.length > 0 && !normalizeText(entry.title).includes(needle)) return false;

  if (!matchesEnumFacet(filter.formats, entry.format)) return false;
  if (!matchesEnumFacet(filter.statuses, entry.status)) return false;
  if (!matchesEnumFacet(filter.priorities, entry.priority)) return false;
  if (!matchesMultiFacet(filter.genres, entry.genres)) return false;
  if (!matchesMultiFacet(filter.lists, entry.lists)) return false;

  // Faixa de score: sem score, a entrada não tem como satisfazer um limite —
  // some da lista assim que qualquer uma das pontas é definida.
  if (filter.minScore !== null || filter.maxScore !== null) {
    if (entry.averageScore === null) return false;
    if (filter.minScore !== null && entry.averageScore < filter.minScore) return false;
    if (filter.maxScore !== null && entry.averageScore > filter.maxScore) return false;
  }

  return true;
}

export function applyFilter(entries: readonly AnimeEntry[], filter: FilterState): AnimeEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filter));
}

export interface FacetCount<T> {
  readonly value: T;
  readonly count: number;
}

export interface Facets {
  readonly formats: readonly FacetCount<MediaFormat>[];
  readonly statuses: readonly FacetCount<ListStatus>[];
  readonly priorities: readonly FacetCount<Priority>[];
  readonly genres: readonly FacetCount<string>[];
  readonly lists: readonly FacetCount<string>[];
}

/**
 * Conta ocorrências mantendo a ordem canônica do domínio fechado e omitindo
 * o que ninguém tem — uma faceta com contagem 0 só ocuparia espaço na UI.
 */
function countByDomain<T>(domain: readonly T[], values: readonly (T | null)[]): FacetCount<T>[] {
  const tally = new Map<T, number>();
  for (const value of values) {
    if (value === null) continue;
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  return domain
    .filter((value) => tally.has(value))
    .map((value) => ({ value, count: tally.get(value) ?? 0 }));
}

/** Desempate estável por codepoint: `localeCompare` varia com o ICU do runtime. */
function compareCodepoints(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Facetas de domínio aberto (gêneros, listas): ordena pela contagem decrescente
 * e desempata pelo nome, para a UI mostrar primeiro o que mais aparece sem que a
 * ordem dance entre execuções.
 */
function countByFrequency(groups: readonly (readonly string[])[]): FacetCount<string>[] {
  const tally = new Map<string, number>();
  for (const group of groups) {
    for (const value of group) {
      tally.set(value, (tally.get(value) ?? 0) + 1);
    }
  }
  return Array.from(tally, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || compareCodepoints(a.value, b.value),
  );
}

/** Ver RF-15. */
export function computeFacets(entries: readonly AnimeEntry[]): Facets {
  return {
    formats: countByDomain(
      ALL_MEDIA_FORMATS,
      entries.map((e) => e.format),
    ),
    statuses: countByDomain(
      ALL_LIST_STATUSES,
      entries.map((e) => e.status),
    ),
    priorities: countByDomain(
      PRIORITY_FACET_ORDER,
      entries.map((e) => e.priority),
    ),
    genres: countByFrequency(entries.map((e) => e.genres)),
    lists: countByFrequency(entries.map((e) => e.lists)),
  };
}
