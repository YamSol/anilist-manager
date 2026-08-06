/**
 * Estado de autenticação da camada web. Escopo A do REQUIREMENTS (RF-01..RF-06).
 *
 * Toda a lógica de OAuth vive no core (`buildAuthorizeUrl`, `parseTokenFragment`,
 * `isTokenExpired`). Aqui só existe o que é inerentemente do browser: storage,
 * `location` e o redirect.
 */

import {
  buildAuthorizeUrl,
  isTokenExpired,
  parseTokenFragment,
  tokenFromAccessToken,
  type StoredToken,
  type TokenStore,
} from '@anilist-updater/core';
import { createTokenStore, loadClientId, saveClientId } from './tokenStore.js';
import { DEFAULT_ROUTE, routeHref } from './router.js';

/** O Redirect URI registrado no AniList precisa ser exatamente a origem do app. */
export function currentRedirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

/**
 * Ver RF-03. Consome `#access_token=...` do fragmento, persiste o token e
 * **limpa o fragmento** da barra de endereços com `history.replaceState`.
 *
 * Precisa rodar antes de o roteador ler o hash — ver o comentário em `router.ts`.
 * Devolve o token quando havia um; `null` quando o fragmento não era de auth.
 */
export function consumeAuthFragment(
  store: TokenStore = createTokenStore(),
  now: number = Date.now(),
): StoredToken | null {
  const hash = location.hash;
  if (!hash.includes('access_token')) return null;

  const token = parseTokenFragment(hash, now);
  if (token === null) return null;

  store.save(token);
  // O token não pode sobrar no hash visível nem na entrada do histórico (RF-03).
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${routeHref(DEFAULT_ROUTE)}`,
  );
  return token;
}

export interface AuthOptions {
  readonly store?: TokenStore;
  /** Injetável: em jsdom, atribuir `location.href` não navega. */
  readonly redirect?: (url: string) => void;
  readonly now?: () => number;
}

/** Estado reativo de autenticação. Dependências de browser são injetáveis. */
export function createAuth(options: AuthOptions = {}) {
  const store = options.store ?? createTokenStore();
  const now = options.now ?? (() => Date.now());
  const redirect =
    options.redirect ??
    ((url: string) => {
      location.href = url;
    });

  let clientId = $state(loadClientId());
  let token = $state<StoredToken | null>(null);
  let message = $state<string | null>(null);

  // Um token vencido não pode manter o usuário "logado" numa tela quebrada (RF-05).
  const stored = store.load();
  if (stored !== null) {
    if (isTokenExpired(stored, now())) {
      store.clear();
      message = 'Sua sessão expirou. Entre novamente.';
    } else {
      token = stored;
    }
  }

  return {
    get clientId(): string {
      return clientId;
    },
    get token(): StoredToken | null {
      return token;
    },
    get authenticated(): boolean {
      return token !== null;
    },
    get message(): string | null {
      return message;
    },

    setMessage(value: string | null): void {
      message = value;
    },

    /** Ver RF-01. Persistido localmente, sobrevive a recarga e a logout. */
    setClientId(value: string): void {
      clientId = value.trim();
      saveClientId(clientId);
    },

    /** Adota um token já pronto — usado pelo retorno do redirect (RF-03). */
    adopt(value: StoredToken): void {
      token = value;
      message = null;
      store.save(value);
    },

    /**
     * Ver RF-04. Sem expiração declarada, assumimos a vida útil padrão e deixamos
     * o 401 (RF-05) ser a verdade final sobre a validade do token.
     */
    pasteToken(accessToken: string): boolean {
      // A política de expiração de um token colado é do core (RF-04), para que
      // web, CLI e APK não inventem prazos diferentes cada um.
      let value: StoredToken;
      try {
        value = tokenFromAccessToken(accessToken, now());
      } catch {
        message = 'Cole um access token válido.';
        return false;
      }
      token = value;
      message = null;
      store.save(value);
      return true;
    },

    /** Ver RF-02. Monta a URL de autorização (sem secret) e redireciona. */
    login(): void {
      if (clientId === '') {
        message = 'Informe o Client ID antes de entrar.';
        return;
      }
      redirect(buildAuthorizeUrl({ clientId, redirectUri: currentRedirectUri() }));
    },

    /** Ver RF-06. Apaga o token; o Client ID **permanece** no storage. */
    logout(reason: string | null = null): void {
      store.clear();
      token = null;
      message = reason;
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
