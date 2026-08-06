/**
 * Modelo canônico do domínio. Ver §5.1 de docs/REQUIREMENTS.md.
 *
 * STUB — assinaturas congeladas. Implementação na branch feat/core.
 */

import { notImplemented } from './internal/stub.js';

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
 * Dedupe por `mediaId`, agregando os nomes das listas.
 *
 * Sucessor do laço em `app_anilist.py:108-126`, agora compartilhado por lista,
 * conversão e snapshot. Ver RF-10 e RF-11.
 */
export function normalizeCollection(_raw: unknown): AnimeEntry[] {
  return notImplemented('normalizeCollection');
}

/** Ver RF-12. Lança `AniListError` se os três títulos forem nulos. */
export function pickTitle(_title: TitleFragment): string {
  return notImplemented('pickTitle');
}
