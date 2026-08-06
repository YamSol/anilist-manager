/**
 * Implementação web da `TokenStore` do core (§5.4 do REQUIREMENTS).
 *
 * O core declara só a interface (RNF-03); quem sabe o que é `localStorage` é
 * esta camada. Um CLI Node forneceria uma implementação em arquivo sem que uma
 * linha do core mudasse.
 */

import type { StoredToken, TokenStore } from '@anilist-updater/core';
import { STORAGE_KEYS, readJson, readRaw, removeRaw, writeJson, writeRaw } from './storage.js';

/** Valida a forma do que veio do storage: o usuário pode ter editado à mão. */
function isStoredToken(value: unknown): value is StoredToken {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.tokenType === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt)
  );
}

export function createTokenStore(): TokenStore {
  return {
    load(): StoredToken | null {
      const value = readJson(STORAGE_KEYS.token);
      return isStoredToken(value) ? value : null;
    },
    save(token: StoredToken): void {
      writeJson(STORAGE_KEYS.token, token);
    },
    clear(): void {
      removeRaw(STORAGE_KEYS.token);
    },
  };
}

/**
 * Ver RF-01 e RF-06. O Client ID é **configuração**, não credencial: fica em
 * texto puro no storage e sobrevive ao logout.
 *
 * `VITE_ANILIST_CLIENT_ID` é apenas um valor inicial opcional — o artefato
 * buildado não embute nenhum Client ID obrigatório (AD-06).
 */
export function loadClientId(): string {
  const stored = readRaw(STORAGE_KEYS.clientId);
  if (stored !== null && stored.trim() !== '') return stored.trim();

  const fallback: unknown = import.meta.env.VITE_ANILIST_CLIENT_ID;
  return typeof fallback === 'string' ? fallback.trim() : '';
}

export function saveClientId(clientId: string): void {
  writeRaw(STORAGE_KEYS.clientId, clientId.trim());
}

/**
 * Ver RF-02. O Client Secret do client do próprio usuário.
 *
 * Diferente do Client ID, é credencial: some no logout (RF-06). Não existe default
 * de build — nenhum secret é embutido no artefato (RNF-02, AD-06).
 */
export function loadClientSecret(): string {
  return readRaw(STORAGE_KEYS.clientSecret)?.trim() ?? '';
}

export function saveClientSecret(clientSecret: string): void {
  writeRaw(STORAGE_KEYS.clientSecret, clientSecret.trim());
}

export function clearClientSecret(): void {
  removeRaw(STORAGE_KEYS.clientSecret);
}
