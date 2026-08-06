/**
 * Rótulos em pt-BR para os enums da API (RNF-10).
 *
 * É apresentação, não domínio: o core trabalha com os valores crus do AniList
 * (`TV`, `CURRENT`, `FALL`) e nunca precisa saber como eles são escritos na tela.
 */

import type { ListStatus, MediaFormat, MediaSeason } from '@anilist-updater/core';

export const FORMAT_LABELS: Readonly<Record<MediaFormat, string>> = Object.freeze({
  TV: 'TV',
  TV_SHORT: 'TV curta',
  MOVIE: 'Filme',
  SPECIAL: 'Especial',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Música',
});

export const STATUS_LABELS: Readonly<Record<ListStatus, string>> = Object.freeze({
  CURRENT: 'Assistindo',
  PLANNING: 'Planejo assistir',
  COMPLETED: 'Completo',
  DROPPED: 'Abandonado',
  PAUSED: 'Pausado',
  REPEATING: 'Rewatch',
});

export const SEASON_LABELS: Readonly<Record<MediaSeason, string>> = Object.freeze({
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
});

export function formatLabel(value: MediaFormat | null): string {
  return value === null ? '—' : FORMAT_LABELS[value];
}

export function statusLabel(value: ListStatus | null): string {
  return value === null ? '—' : STATUS_LABELS[value];
}

/** `FALL` + `2023` → `Outono 2023`. */
export function seasonLabel(season: MediaSeason | null, year: number | null): string {
  if (season === null && year === null) return '—';
  if (season === null) return String(year);
  if (year === null) return SEASON_LABELS[season];
  return `${SEASON_LABELS[season]} ${String(year)}`;
}

/** Traduz o tipo do erro em texto acionável. A UI nunca inspeciona a mensagem crua. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    switch (error.name) {
      case 'AuthError':
        return 'Sessão inválida ou expirada. Entre novamente.';
      case 'RateLimitError':
        return 'Limite de requisições do AniList atingido. Aguarde um instante e tente de novo.';
      case 'NetworkError':
        return 'Falha de rede ao falar com o AniList. Verifique sua conexão.';
      case 'GraphQLError':
        return `O AniList recusou a requisição: ${error.message}`;
      case 'SnapshotParseError':
        return `Snapshot inválido: ${error.message}`;
      default:
        return error.message;
    }
  }
  return 'Erro inesperado.';
}
