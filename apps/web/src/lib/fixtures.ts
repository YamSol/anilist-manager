/**
 * Lista de exemplo usada pelos testes de componente e pelo E2E.
 *
 * Existe porque `packages/core` ainda é stub nesta branch: os componentes são
 * exercitados contra dados fixos em vez de contra a API. Cobre de propósito os
 * casos de borda que o REQUIREMENTS cita:
 *   - um anime em várias listas (RF-10)
 *   - um anime com prioridade 0 (RF-22, RF-35)
 *   - um anime cujo título só existe em romaji (RF-12)
 *   - uma prioridade 3, que a conversão deixa inalterada (RF-22)
 */

import type { AnimeEntry } from '@anilist-updater/core';

export const SAMPLE_ENTRIES: readonly AnimeEntry[] = Object.freeze([
  {
    id: 11757,
    title: 'Sword Art Online',
    priority: 1,
    // Em três listas ao mesmo tempo: uma linha só, listas agregadas (RF-10).
    lists: ['Assistindo', 'Favoritos', 'Rewatch'],
    status: 'CURRENT',
    format: 'TV',
    genres: ['Action', 'Adventure', 'Fantasy'],
    averageScore: 72,
    episodes: 25,
    progress: 12,
    season: 'SUMMER',
    seasonYear: 2012,
    coverImage: 'https://img.anili.st/media/11757',
  },
  {
    id: 154587,
    // Sem título em inglês: cai para romaji (RF-12).
    title: 'Sousou no Frieren',
    priority: 2,
    lists: ['Planejando'],
    status: 'PLANNING',
    format: 'TV',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    averageScore: 91,
    episodes: 28,
    progress: 0,
    season: 'FALL',
    seasonYear: 2023,
    coverImage: 'https://img.anili.st/media/154587',
  },
  {
    id: 113415,
    title: 'Jujutsu Kaisen',
    // Prioridade 3: a conversão a deixa inalterada (RF-22).
    priority: 3,
    lists: ['Completos'],
    status: 'COMPLETED',
    format: 'TV',
    genres: ['Action', 'Supernatural'],
    averageScore: 86,
    episodes: 24,
    progress: 24,
    season: 'FALL',
    seasonYear: 2020,
    coverImage: 'https://img.anili.st/media/113415',
  },
  {
    id: 21519,
    title: 'Your Name.',
    priority: 5,
    lists: ['Completos', 'Favoritos'],
    status: 'COMPLETED',
    format: 'MOVIE',
    genres: ['Drama', 'Romance', 'Supernatural'],
    averageScore: 85,
    episodes: 1,
    progress: 1,
    season: 'SUMMER',
    seasonYear: 2016,
    coverImage: 'https://img.anili.st/media/21519',
  },
  {
    id: 115230,
    title: 'Tower of God',
    // Sem prioridade: ignorada pela conversão (RF-22) e pendência no relatório (RF-35).
    priority: 0,
    lists: ['Pausados'],
    status: 'PAUSED',
    format: 'ONA',
    genres: ['Action', 'Adventure', 'Mystery'],
    averageScore: 74,
    episodes: 13,
    progress: 6,
    season: 'SPRING',
    seasonYear: 2020,
    coverImage: null,
  },
  {
    id: 20605,
    title: 'Tokyo Ghoul',
    priority: 4,
    lists: ['Abandonados'],
    status: 'DROPPED',
    format: 'TV',
    genres: ['Action', 'Horror', 'Supernatural'],
    averageScore: 71,
    episodes: 12,
    progress: 3,
    season: 'SUMMER',
    seasonYear: 2014,
    coverImage: 'https://img.anili.st/media/20605',
  },
]);
