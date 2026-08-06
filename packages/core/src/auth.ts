/**
 * OAuth implicit grant do AniList. Ver §5.4 de docs/REQUIREMENTS.md.
 *
 * Não existe client secret neste projeto (RNF-02, AD-05). O fluxo PIN do AniList
 * foi descartado justamente porque devolve um `code` cuja troca exigiria o secret.
 */

import { AniListError } from './errors.js';
import { ANILIST_AUTHORIZE_ENDPOINT } from './queries.js';

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

/**
 * Validade assumida quando o AniList não manda `expires_in`.
 *
 * Na prática ele sempre manda (um ano). Uma hora é a escolha conservadora para o
 * caso degenerado: pedir login de novo cedo demais é um incômodo, tratar uma
 * credencial de validade desconhecida como eterna é um bug de segurança.
 */
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Ver RF-02. Produz uma URL com `response_type=token`, sem secret. */
export function buildAuthorizeUrl(config: AuthConfig): string {
  const clientId = config.clientId.trim();
  const redirectUri = config.redirectUri.trim();

  if (clientId.length === 0) {
    throw new AniListError('Client ID não informado. Ver RF-01.');
  }
  if (redirectUri.length === 0) {
    throw new AniListError('Redirect URI não informada. Ver RF-02.');
  }

  const url = new URL(ANILIST_AUTHORIZE_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  // O implicit grant é o que torna o app secretless (AD-05): o token volta no
  // fragmento, sem nenhuma troca server-to-server.
  url.searchParams.set('response_type', 'token');

  return url.toString();
}

/**
 * Ver RF-03. Lê `#access_token=...&token_type=...&expires_in=...`.
 * Devolve `null` se o fragmento não contiver um token.
 *
 * `now` é injetado (RNF-03) para que a expiração seja testável.
 */
export function parseTokenFragment(fragment: string, now: number): StoredToken | null {
  // Aceita com ou sem o `#` — quem chama pode passar `location.hash` cru.
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.trim().length === 0) return null;

  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token')?.trim() ?? '';
  if (accessToken.length === 0) return null;

  const tokenType = params.get('token_type')?.trim();
  const expiresIn = Number(params.get('expires_in'));
  const ttlMs =
    Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : DEFAULT_TOKEN_TTL_MS;

  return {
    accessToken,
    tokenType: tokenType !== undefined && tokenType.length > 0 ? tokenType : 'Bearer',
    expiresAt: now + ttlMs,
  };
}

export function isTokenExpired(token: StoredToken, now: number): boolean {
  return now >= token.expiresAt;
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
