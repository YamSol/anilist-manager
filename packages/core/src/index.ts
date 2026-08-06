/**
 * @anilist-updater/core — a origem única da lógica do AniList Manager.
 *
 * TypeScript puro, sem DOM (RNF-03). Consumido hoje por `apps/web`; amanhã, sem
 * alteração, por um CLI Node e por um build Capacitor (ver Backlog, §7).
 *
 * A superfície pública está congelada em docs/REQUIREMENTS.md §5. Alterá-la exige
 * atualizar aquele documento antes do código.
 */

export * from './errors.js';
export * from './http.js';
export * from './model.js';
export * from './priority.js';
export * from './auth.js';
export * from './client.js';
export * from './filter.js';
export * from './bulk.js';
export * from './snapshot.js';
export {
  ANILIST_AUTHORIZE_ENDPOINT,
  ANILIST_GRAPHQL_ENDPOINT,
  LIST_QUERY,
  UPDATE_PRIORITY_MUTATION,
  VIEWER_QUERY,
} from './queries.js';
