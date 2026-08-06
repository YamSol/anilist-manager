/**
 * Persistência do estado dos filtros facetados (RF-16).
 *
 * A semântica do filtro é do core (`FilterState`, `applyFilter`, `computeFacets`);
 * aqui só serializamos e validamos o que veio do storage. Um estado gravado por
 * uma versão anterior — ou editado à mão — nunca pode quebrar a tela, então
 * campos irreconhecíveis caem para o valor de `EMPTY_FILTER`.
 */

import { EMPTY_FILTER, type FilterState } from '@anilist-updater/core';
import { STORAGE_KEYS, readJson, removeRaw, writeJson } from './storage.js';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function priorityArray(value: unknown): (0 | 1 | 2 | 3 | 4 | 5)[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is 0 | 1 | 2 | 3 | 4 | 5 => {
    return typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 5;
  });
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Reconstrói um `FilterState` válido a partir de dado não confiável. */
export function coerceFilter(value: unknown): FilterState {
  if (typeof value !== 'object' || value === null) return EMPTY_FILTER;
  const raw = value as Record<string, unknown>;
  return {
    text: typeof raw.text === 'string' ? raw.text : '',
    // Os enums não são revalidados contra a união: um valor extinto apenas não
    // casa com nenhuma entrada, o que é degradação aceitável e não um crash.
    formats: stringArray(raw.formats) as FilterState['formats'],
    statuses: stringArray(raw.statuses) as FilterState['statuses'],
    priorities: priorityArray(raw.priorities),
    genres: stringArray(raw.genres),
    lists: stringArray(raw.lists),
    minScore: nullableNumber(raw.minScore),
    maxScore: nullableNumber(raw.maxScore),
  };
}

export function loadFilter(): FilterState {
  return coerceFilter(readJson(STORAGE_KEYS.filter));
}

export function saveFilter(filter: FilterState): void {
  writeJson(STORAGE_KEYS.filter, filter);
}

export function clearFilter(): void {
  removeRaw(STORAGE_KEYS.filter);
}

/** Um filtro "vazio" não restringe nada — usado para habilitar o botão de limpar. */
export function isFilterActive(filter: FilterState): boolean {
  return (
    filter.text.trim() !== '' ||
    filter.formats.length > 0 ||
    filter.statuses.length > 0 ||
    filter.priorities.length > 0 ||
    filter.genres.length > 0 ||
    filter.lists.length > 0 ||
    filter.minScore !== null ||
    filter.maxScore !== null
  );
}
