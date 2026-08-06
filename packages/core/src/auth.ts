/**
 * OAuth implicit grant do AniList. Ver §5.4 de docs/REQUIREMENTS.md.
 *
 * Não existe client secret neste projeto (RNF-02, AD-05). O fluxo PIN do AniList
 * foi descartado justamente porque devolve um `code` cuja troca exigiria o secret.
 */

import { notImplemented } from './internal/stub.js';

export interface AuthConfig {
  readonly clientId: string;
  readonly redirectUri: string;
}

export interface StoredToken {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Epoch em milissegundos. */
  readonly expiresAt: number;
}

/** Ver RF-02. Produz uma URL com `response_type=token`, sem secret. */
export function buildAuthorizeUrl(_config: AuthConfig): string {
  return notImplemented('buildAuthorizeUrl');
}

/**
 * Ver RF-03. Lê `#access_token=...&token_type=...&expires_in=...`.
 * Devolve `null` se o fragmento não contiver um token.
 *
 * `now` é injetado (RNF-03) para que a expiração seja testável.
 */
export function parseTokenFragment(_fragment: string, _now: number): StoredToken | null {
  return notImplemented('parseTokenFragment');
}

export function isTokenExpired(_token: StoredToken, _now: number): boolean {
  return notImplemented('isTokenExpired');
}

/**
 * Implementado pela camada de UI sobre `localStorage`. O core só depende da
 * interface — é o que mantém RNF-03 e permite um TokenStore de arquivo no CLI.
 */
export interface TokenStore {
  load(): StoredToken | null;
  save(token: StoredToken): void;
  clear(): void;
}
