/**
 * Modelo canônico do domínio. Ver §5.1 de docs/REQUIREMENTS.md.
 */

import { AniListError } from './errors.js';

export type Priority = 0 | 1 | 2 | 3 | 4 | 5;

export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';

export type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

/** Uma linha da lista: um anime, deduplicado entre as listas que o contêm. */
export interface AnimeEntry {
  /** `mediaId` no AniList. */
  readonly id: number;
  /** Precedência english → romaji → native. Ver RF-12. */
  readonly title: string;
  readonly priority: Priority;
  /** Nomes das listas que contêm o anime. Ver RF-10. */
  readonly lists: readonly string[];
  readonly status: ListStatus | null;
  readonly format: MediaFormat | null;
  readonly genres: readonly string[];
  /** 0..100, como o AniList devolve. */
  readonly averageScore: number | null;
  readonly episodes: number | null;
  readonly progress: number;
  readonly season: MediaSeason | null;
  readonly seasonYear: number | null;
  readonly coverImage: string | null;
}

export interface TitleFragment {
  readonly english?: string | null;
  readonly romaji?: string | null;
  readonly native?: string | null;
}

/**
 * Domínios fechados da API, na ordem canônica de exibição. Servem para dois fins:
 * validar o que a API devolveu e dar às facetas uma ordem estável (RF-15).
 */
export const ALL_MEDIA_FORMATS: readonly MediaFormat[] = Object.freeze([
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
] as const);

export const ALL_LIST_STATUSES: readonly ListStatus[] = Object.freeze([
  'CURRENT',
  'REPEATING',
  'PLANNING',
  'PAUSED',
  'COMPLETED',
  'DROPPED',
] as const);

export const ALL_MEDIA_SEASONS: readonly MediaSeason[] = Object.freeze([
  'WINTER',
  'SPRING',
  'SUMMER',
  'FALL',
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Só aceita string com conteúdo: `''` e `'   '` contam como ausente. */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = asText(item);
    if (text !== null) out.push(text);
  }
  return out;
}

function asPriority(value: unknown): Priority {
  // A API devolve `null` para quem nunca definiu prioridade; 0 é o valor canônico
  // de "sem prioridade", então tudo que não for 1..5 colapsa em 0.
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return value >= 1 && value <= 5 ? (value as Priority) : 0;
}

/** Só deixa passar valor que pertence ao domínio fechado; o resto vira `null`. */
function asEnum<T extends string>(value: unknown, domain: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  return (domain as readonly string[]).includes(value) ? (value as T) : null;
}

/** Ver RF-12. Lança `AniListError` se os três títulos forem nulos. */
export function pickTitle(title: TitleFragment): string {
  const resolved = asText(title.english) ?? asText(title.romaji) ?? asText(title.native);
  if (resolved === null) {
    throw new AniListError('Entrada sem título: english, romaji e native estão vazios.');
  }
  return resolved;
}

/**
 * Título tolerante a falhas, usado só no caminho de normalização.
 *
 * `pickTitle` lança por contrato (§5.1), mas `normalizeCollection` não pode
 * derrubar a lista inteira por causa de um anime sem título — perder a linha
 * seria pior do que exibi-la com um rótulo técnico.
 */
function resolveTitle(raw: unknown, mediaId: number): string {
  if (isRecord(raw)) {
    const resolved = asText(raw.english) ?? asText(raw.romaji) ?? asText(raw.native);
    if (resolved !== null) return resolved;
  }
  return `#${String(mediaId)}`;
}

/** Forma mutável de `AnimeEntry`, usada só enquanto as listas são agregadas. */
interface EntryDraft {
  id: number;
  title: string;
  priority: Priority;
  lists: string[];
  status: ListStatus | null;
  format: MediaFormat | null;
  genres: string[];
  averageScore: number | null;
  episodes: number | null;
  progress: number;
  season: MediaSeason | null;
  seasonYear: number | null;
  coverImage: string | null;
}

/**
 * Desembrulha a resposta até chegar em `{ lists: [...] }`.
 *
 * Aceita as três formas em que o payload circula: a resposta HTTP completa
 * (`{ data: { MediaListCollection: ... } }`), o `data` já desembrulhado
 * (`{ MediaListCollection: ... }` — é o que `AniListClient.getAnimeList` passa,
 * porque `request` devolve o `data`) e a coleção crua (`{ lists: [...] }`).
 */
function unwrapLists(raw: unknown): unknown[] {
  let node: unknown = raw;
  if (isRecord(node) && 'data' in node) node = node.data;
  if (isRecord(node) && 'MediaListCollection' in node) node = node.MediaListCollection;
  if (!isRecord(node)) return [];
  const lists: unknown = node.lists;
  return Array.isArray(lists) ? lists : [];
}

/**
 * Dedupe por `mediaId`, agregando os nomes das listas.
 *
 * Sucessor do laço em `app_anilist.py:108-126`, agora compartilhado por lista,
 * conversão e snapshot. Ver RF-10 e RF-11.
 *
 * Nunca lança: a entrada é `unknown` porque vem da rede. Campo ausente vira
 * `null` (ou `0` / `[]` onde o contrato não admite nulo) e entrada sem
 * `mediaId` numérico é descartada — não há como deduplicar nem escrever nela.
 *
 * A primeira ocorrência de um `mediaId` define os campos escalares; as
 * seguintes só acrescentam o nome da lista, preservando a ordem de aparição.
 */
export function normalizeCollection(raw: unknown): AnimeEntry[] {
  const seen = new Map<number, EntryDraft>();

  for (const list of unwrapLists(raw)) {
    if (!isRecord(list)) continue;
    const listName = asText(list.name);
    const entries: unknown = list.entries;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries as unknown[]) {
      if (!isRecord(entry)) continue;
      const rawId = asFiniteNumber(entry.mediaId);
      if (rawId === null || !Number.isInteger(rawId)) continue;
      const mediaId = rawId;

      const existing = seen.get(mediaId);
      if (existing) {
        // Mesmo anime em várias listas continua sendo uma linha só (RF-10).
        if (listName !== null && !existing.lists.includes(listName)) {
          existing.lists.push(listName);
        }
        continue;
      }

      const media = isRecord(entry.media) ? entry.media : {};
      const cover = isRecord(media.coverImage) ? media.coverImage : {};

      seen.set(mediaId, {
        id: mediaId,
        title: resolveTitle(media.title, mediaId),
        priority: asPriority(entry.priority),
        lists: listName !== null ? [listName] : [],
        status: asEnum(entry.status, ALL_LIST_STATUSES),
        format: asEnum(media.format, ALL_MEDIA_FORMATS),
        genres: asStringArray(media.genres),
        averageScore: asFiniteNumber(media.averageScore),
        episodes: asFiniteNumber(media.episodes),
        progress: asFiniteNumber(entry.progress) ?? 0,
        season: asEnum(media.season, ALL_MEDIA_SEASONS),
        seasonYear: asFiniteNumber(media.seasonYear),
        coverImage: asText(cover.medium) ?? asText(cover.large),
      });
    }
  }

  return Array.from(seen.values());
}
