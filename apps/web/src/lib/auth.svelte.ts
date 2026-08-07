/**
 * Estado de autenticação da camada web. Escopo A do REQUIREMENTS (RF-01..RF-06).
 *
 * Toda a lógica de OAuth vive no core (`buildAuthorizeUrl`, `parseAuthCallback`,
 * `exchangeCodeForToken`, `isTokenExpired`). Aqui só existe o que é inerentemente
 * do browser: storage, `location` e o redirect.
 */

import {
  buildAuthorizeUrl,
  buildTokenExchangeSnippet,
  exchangeCodeForToken,
  isTokenExpired,
  parseAuthCallback,
  parseTokenResponse,
  probeTokenProxy,
  TokenExchangeUnavailableError,
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
import { resolveTokenEndpoint } from './endpoints.js';

/** O Redirect URI registrado no AniList precisa ser exatamente a origem do app. */
export function currentRedirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

export interface CallbackOutcome {
  readonly token: StoredToken | null;
  readonly message: string | null;
  /** `true` quando falta o proxy: a UI conduz a troca à mão (RF-08). */
  readonly needsManualToken: boolean;
  /**
   * Ver RF-08. O authorization code que voltou, preservado **só** quando a troca
   * automática não foi possível.
   *
   * É o que evita mandar o usuário copiar o code da barra de endereços: o app já
   * o tem em mãos, e monta o comando de troca com ele. Fora desse caso vale
   * `null` de propósito — um code já gasto não serve para nada e guardá-lo só
   * criaria a chance de reusá-lo.
   */
  readonly code: string | null;
}

/** Ver RF-07. O que esta hospedagem permite, descoberto antes do redirect. */
export type ProxyStatus = 'verificando' | 'disponivel' | 'ausente';

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
      code: null,
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
      code: callback.code,
      message: 'Informe o Client Secret para completar a troca do código.',
    };
  }

  try {
    const token = await exchangeCodeForToken({
      code: callback.code,
      clientId: loadClientId(),
      clientSecret,
      redirectUri: currentRedirectUri(),
      tokenEndpoint: resolveTokenEndpoint(),
    });
    store.save(token);
    cleanCallbackUrl();
    return { token, message: null, needsManualToken: false, code: null };
  } catch (cause) {
    cleanCallbackUrl();
    // Sem proxy não é erro do usuário: é limitação da hospedagem, e o caminho de
    // saída é conduzir a troca à mão (RF-08). Só nesse caso o code sobrevive —
    // nos demais ele já foi gasto na tentativa.
    const semProxy = cause instanceof TokenExchangeUnavailableError;
    return {
      token: null,
      needsManualToken: semProxy,
      code: semProxy ? callback.code : null,
      message: semProxy ? null : errorMessage(cause),
    };
  }
}

export interface AuthOptions {
  readonly store?: TokenStore;
  /** Injetável: em jsdom, atribuir `location.href` não navega. */
  readonly redirect?: (url: string) => void;
  readonly now?: () => number;
  /** Ver RF-07. Injetável para que o teste não dependa de rede. */
  readonly probe?: () => Promise<boolean>;
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
  /** Ligado quando a hospedagem não tem proxy: a UI conduz a troca à mão. */
  let manualTokenOnly = $state(false);
  let proxyStatus = $state<ProxyStatus>('verificando');
  /** Ver RF-08. O code capturado do retorno, à espera da troca manual. */
  let pendingCode = $state<string | null>(null);

  // Um token vencido não pode manter o usuário "logado" numa tela quebrada (RF-05).
  const stored = store.load();
  const sessaoRestaurada = stored !== null && !isTokenExpired(stored, now());
  if (stored !== null) {
    if (sessaoRestaurada) {
      token = stored;
    } else {
      store.clear();
      message = 'Sua sessão expirou. Entre novamente.';
    }
  }

  // RF-07: descobrir a capacidade da hospedagem é a única forma de avisar ANTES
  // do redirect. Só interessa a quem ainda vai entrar — para quem já tem token,
  // seria uma requisição sem consumidor.
  //
  // A condição olha `sessaoRestaurada`, e não `token`: ler um `$state` fora de
  // closure captura só o valor inicial, e o compilador avisa com razão. Aqui o
  // valor inicial é exatamente o que queremos, mas dizê-lo por uma constante
  // deixa isso explícito em vez de parecer descuido.
  if (!sessaoRestaurada) {
    const probe =
      options.probe ?? (() => probeTokenProxy({ tokenEndpoint: resolveTokenEndpoint() }));
    void probe().then((disponivel) => {
      proxyStatus = disponivel ? 'disponivel' : 'ausente';
    });
  }

  return {
    get proxyStatus(): ProxyStatus {
      return proxyStatus;
    },
    get pendingCode(): string | null {
      return pendingCode;
    },

    /**
     * Ver RF-08 e AD-11. O comando pronto para o console, ou `null` quando falta
     * peça — sem code não há o que trocar, e sem credencial o comando sairia
     * incompleto e falharia no console, longe daqui.
     */
    get exchangeSnippet(): string | null {
      if (pendingCode === null || clientId === '' || clientSecret === '') return null;
      return buildTokenExchangeSnippet({
        code: pendingCode,
        clientId,
        clientSecret,
        redirectUri: currentRedirectUri(),
      });
    },

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
      pendingCode = null;
      store.save(value);
    },

    /** Registra o desfecho do retorno de autorização processado no boot (RF-03). */
    applyCallback(outcome: CallbackOutcome): void {
      if (outcome.token !== null) {
        token = outcome.token;
        message = null;
        manualTokenOnly = false;
        pendingCode = null;
        return;
      }
      message = outcome.message;
      manualTokenOnly = outcome.needsManualToken;
      pendingCode = outcome.code;
      // A troca falhou por falta de proxy, e é isso que a sonda teria dito. Não
      // esperamos por ela para corrigir a tela: já temos a resposta, e mais forte.
      if (outcome.needsManualToken) proxyStatus = 'ausente';
    },

    /**
     * Ver RF-08. Aceita a resposta inteira do AniList ou um access token cru.
     *
     * Quem chegou aqui pelo caminho sem proxy acabou de rodar o comando no
     * console e tem um objeto JSON na área de transferência; obrigá-lo a extrair
     * um campo dali seria devolver o trabalho manual que este fluxo existe para
     * eliminar.
     */
    submitTokenResponse(input: string): boolean {
      // A política de expiração e o formato aceito são do core (RF-04, RF-08),
      // para que web, CLI e APK não inventem regras diferentes cada um.
      let value: StoredToken;
      try {
        value = parseTokenResponse(input, now());
      } catch (cause) {
        // Aqui NÃO passa por errorMessage(): as mensagens de parseTokenResponse
        // já são acionáveis e citam o motivo do próprio AniList. O mapeamento
        // por tipo trocaria "authorization code has expired" — que diz o que
        // fazer — pelo genérico "sessão inválida", que não diz.
        message = cause instanceof Error ? cause.message : errorMessage(cause);
        return false;
      }
      token = value;
      message = null;
      manualTokenOnly = false;
      pendingCode = null;
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
      // Um code pendente é de uso único e amarrado à sessão que acabou: mantê-lo
      // ofereceria ao próximo login um comando que só pode falhar.
      pendingCode = null;
      message = reason;
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
