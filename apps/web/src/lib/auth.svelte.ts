/**
 * Estado de autenticação da camada web. Escopo A do REQUIREMENTS (RF-01..RF-06).
 *
 * Toda a lógica de OAuth vive no core (`buildAuthorizeUrl`, `parseTokenFragment`,
 * `isTokenExpired`). Aqui só existe o que é inerentemente do browser: storage,
 * `location` e o redirect.
 */

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  isTokenExpired,
  parseAuthCallback,
  TokenExchangeUnavailableError,
  tokenFromAccessToken,
  type StoredToken,
  type TokenStore,
} from '@anilist-updater/core';
import {
  clearClientSecret,
  createTokenStore,
  loadClientId,
  loadClientSecret,
  saveClientId,
  saveClientSecret,
} from './tokenStore.js';
import { DEFAULT_ROUTE, routeHref } from './router.js';
import { errorMessage } from './labels.js';

/** O Redirect URI registrado no AniList precisa ser exatamente a origem do app. */
export function currentRedirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

export interface CallbackOutcome {
  readonly token: StoredToken | null;
  readonly message: string | null;
  /** `true` quando falta o proxy: a UI deve oferecer colar o token (RF-04). */
  readonly needsManualToken: boolean;
}

/** Limpa `?code=…` da barra de endereços e volta para a rota padrão. */
function cleanCallbackUrl(): void {
  history.replaceState(null, '', `${location.pathname}${routeHref(DEFAULT_ROUTE)}`);
}

/**
 * Ver RF-03. Consome o `?code=…` do retorno do AniList, troca por um token pelo
 * proxy de mesma origem e **limpa a query** da barra de endereços.
 *
 * É assíncrona porque a troca é uma chamada de rede — o implicit grant, que seria
 * síncrono, não existe no AniList (ver o cabeçalho de `packages/core/src/auth.ts`).
 *
 * Devolve `null` quando a query não era um retorno de autorização.
 */
export async function consumeAuthCallback(
  store: TokenStore = createTokenStore(),
): Promise<CallbackOutcome | null> {
  const callback = parseAuthCallback(location.search);
  if (callback === null) return null;

  if (callback.error !== null) {
    cleanCallbackUrl();
    return {
      token: null,
      needsManualToken: false,
      message: callback.errorDescription ?? `O AniList recusou a autorização (${callback.error}).`,
    };
  }
  if (callback.code === null) return null;

  const clientSecret = loadClientSecret();
  if (clientSecret === '') {
    cleanCallbackUrl();
    return {
      token: null,
      needsManualToken: true,
      message: 'Client Secret não informado — não dá para completar a troca do código.',
    };
  }

  try {
    const token = await exchangeCodeForToken({
      code: callback.code,
      clientId: loadClientId(),
      clientSecret,
      redirectUri: currentRedirectUri(),
    });
    store.save(token);
    cleanCallbackUrl();
    return { token, message: null, needsManualToken: false };
  } catch (cause) {
    cleanCallbackUrl();
    return {
      token: null,
      // Sem proxy não é erro do usuário: é limitação da hospedagem, e o caminho
      // de saída é colar o token (RF-04).
      needsManualToken: cause instanceof TokenExchangeUnavailableError,
      message: errorMessage(cause),
    };
  }
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
  let clientSecret = $state(loadClientSecret());
  let token = $state<StoredToken | null>(null);
  let message = $state<string | null>(null);
  /** Ligado quando a hospedagem não tem proxy: a UI passa a pedir o token colado. */
  let manualTokenOnly = $state(false);

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
    get clientSecret(): string {
      return clientSecret;
    },
    get manualTokenOnly(): boolean {
      return manualTokenOnly;
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

    /** Ver RF-02. Credencial: some no logout, diferente do Client ID. */
    setClientSecret(value: string): void {
      clientSecret = value.trim();
      saveClientSecret(clientSecret);
    },

    /** Adota um token já pronto — usado pelo retorno do redirect (RF-03). */
    adopt(value: StoredToken): void {
      token = value;
      message = null;
      manualTokenOnly = false;
      store.save(value);
    },

    /** Registra o desfecho do retorno de autorização processado no boot (RF-03). */
    applyCallback(outcome: CallbackOutcome): void {
      if (outcome.token !== null) {
        token = outcome.token;
        message = null;
        manualTokenOnly = false;
        return;
      }
      message = outcome.message;
      manualTokenOnly = outcome.needsManualToken;
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
      manualTokenOnly = false;
      store.save(value);
      return true;
    },

    /**
     * Ver RF-02. Redireciona para o consentimento com `response_type=code`.
     *
     * O secret não vai nesta URL — ele só entra na troca do código, depois, pelo
     * proxy de mesma origem.
     */
    login(): void {
      if (clientId === '') {
        message = 'Informe o Client ID antes de entrar.';
        return;
      }
      if (clientSecret === '') {
        message = 'Informe também o Client Secret: o AniList exige a troca do código.';
        return;
      }
      redirect(buildAuthorizeUrl({ clientId, redirectUri: currentRedirectUri() }));
    },

    /**
     * Ver RF-06. Apaga token e Client Secret; o Client ID **permanece**, porque é
     * configuração e não credencial.
     */
    logout(reason: string | null = null): void {
      store.clear();
      clearClientSecret();
      clientSecret = '';
      token = null;
      message = reason;
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
