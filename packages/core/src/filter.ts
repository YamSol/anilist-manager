/**
 * Filtro facetado e busca textual. Ver §5.6 de docs/REQUIREMENTS.md.
 *
 * Tudo aqui é função pura sobre `AnimeEntry[]` — nenhuma consulta à rede,
 * nenhum estado. O filtro é AND entre facetas e OR dentro de cada faceta.
 */

import { notImplemented } from './internal/stub.js';
import type { AnimeEntry, ListStatus, MediaFormat, Priority } from './model.js';

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

/** Ver RF-13. Faceta vazia não restringe nada. */
export function matchesFilter(_entry: AnimeEntry, _filter: FilterState): boolean {
  return notImplemented('matchesFilter');
}

export function applyFilter(_entries: readonly AnimeEntry[], _filter: FilterState): AnimeEntry[] {
  return notImplemented('applyFilter');
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

/** Ver RF-15. */
export function computeFacets(_entries: readonly AnimeEntry[]): Facets {
  return notImplemented('computeFacets');
}

/** Ver RF-14. Minúsculas e sem acentos, para busca insensível a ambos. */
export function normalizeText(_value: string): string {
  return notImplemented('normalizeText');
}
