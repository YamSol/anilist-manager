/**
 * OAuth do AniList: **authorization code grant**. Ver §5.4 de docs/REQUIREMENTS.md.
 *
 * ═══ POR QUE NÃO É IMPLICIT GRANT ═══
 * A v2.0 foi desenhada sobre implicit grant (`response_type=token`), que dispensaria
 * secret e troca server-to-server. Verificado contra a API real em 2026-08-06, isso
 * não funciona:
 *
 *   - `response_type=token` → `{"error":"unsupported_grant_type"}`. É o
 *     `unsupportedGrantType()` do league/oauth2-server, disparado quando nenhum grant
 *     habilitado sabe responder — ou seja, o implicit está desligado no AniList.
 *   - `OPTIONS https://anilist.co/api/v2/oauth/token` → 404, e o POST volta sem
 *     `Access-Control-Allow-Origin`. O browser não consegue trocar o code sozinho.
 *
 * Daí o desenho atual (AD-10): o fluxo é code grant, e a troca passa por um proxy de
 * **mesma origem** (`tokenEndpoint`) que o dev server e o nginx do container fornecem.
 * Onde não houver proxy, `exchangeCodeForToken` lança `TokenExchangeUnavailableError`
 * e a UI cai para colar o token (RF-04).
 */

import { AniListError, AuthError, NetworkError, TokenExchangeUnavailableError } from './errors.js';
import type { Fetcher } from './http.js';
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
  /**
   * Ver RF-09. Só existe quando veio de uma troca — a entrada manual de um
   * access token não tem como produzi-lo.
   *
   * Opcional de propósito: um token sem refresh é um estado normal e permanente,
   * não um erro. Quem renova precisa checar antes de tentar.
   */
  readonly refreshToken?: string;
}

/**
 * Validade assumida quando a resposta não traz `expires_in`.
 *
 * Uma hora é a escolha conservadora para o caso degenerado: pedir login cedo demais
 * incomoda, tratar credencial de validade desconhecida como eterna é bug de segurança.
 */
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Validade documentada dos tokens do AniList: um ano. */
export const ANILIST_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Caminho de mesma origem em que o proxy de troca de token é esperado (AD-10). */
export const TOKEN_PROXY_PATH = '/oauth/token';

/** Ver RF-02. `response_type=code` — o AniList não habilita implicit grant. */
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
  url.searchParams.set('response_type', 'code');

  return url.toString();
}

export interface AuthCallback {
  /** Presente quando o usuário autorizou. */
  readonly code: string | null;
  /** Presente quando o usuário recusou ou o AniList rejeitou. */
  readonly error: string | null;
  readonly errorDescription: string | null;
}

/**
 * Ver RF-03. Lê `?code=...` ou `?error=...` da **query** do redirect de volta.
 *
 * O code vem na query, não no fragmento — o que, de quebra, elimina o conflito que
 * o implicit grant teria com o roteador por hash.
 *
 * Devolve `null` quando a query não é de um retorno de autorização.
 */
export function parseAuthCallback(search: string): AuthCallback | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (raw.trim().length === 0) return null;

  const params = new URLSearchParams(raw);
  const code = params.get('code')?.trim() ?? '';
  const error = params.get('error')?.trim() ?? '';

  if (code.length === 0 && error.length === 0) return null;

  return {
    code: code.length > 0 ? code : null,
    error: error.length > 0 ? error : null,
    errorDescription: params.get('error_description')?.trim() ?? null,
  };
}

export interface ExchangeCodeOptions {
  readonly code: string;
  readonly clientId: string;
  /**
   * O secret do **próprio usuário**, do client que ele registrou. Não é um segredo
   * nosso e nunca sai do dispositivo dele além de ir ao AniList pelo proxy (RNF-02).
   */
  readonly clientSecret: string;
  readonly redirectUri: string;
  /** Default: `TOKEN_PROXY_PATH`. Um caminho de mesma origem, nunca anilist.co. */
  readonly tokenEndpoint?: string;
  readonly fetcher?: Fetcher;
  readonly now?: () => number;
}

function resolveGlobalFetch(): Fetcher {
  const globalFetch: unknown = globalThis.fetch;
  if (typeof globalFetch !== 'function') {
    throw new AniListError(
      'Nenhum fetch disponível neste ambiente. Injete `fetcher` em ExchangeCodeOptions (RNF-03).',
    );
  }
  // Chama via globalThis para não perder o binding.
  return (url, init) => globalThis.fetch(url, init);
}

interface TokenResponse {
  readonly access_token?: unknown;
  readonly token_type?: unknown;
  readonly expires_in?: unknown;
  readonly refresh_token?: unknown;
}

/**
 * Converte a resposta do token endpoint num `StoredToken`, uma vez só.
 *
 * A mesma resposta chega por dois caminhos — a troca pelo proxy e, onde não há
 * proxy, colada à mão pelo usuário (AD-11). Interpretá-la em dois lugares seria
 * a garantia de que um deles esqueceria o `refresh_token` ou o `expires_in`.
 *
 * Devolve `null` quando o payload não é uma resposta de token, para que cada
 * chamador diga o que isso significa no contexto dele.
 */
function tokenFromPayload(payload: TokenResponse, now: number): StoredToken | null {
  if (typeof payload.access_token !== 'string' || payload.access_token.trim().length === 0) {
    return null;
  }

  const expiresIn = Number(payload.expires_in);
  const ttlMs =
    Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : ANILIST_TOKEN_TTL_MS;

  const refreshToken =
    typeof payload.refresh_token === 'string' && payload.refresh_token.trim().length > 0
      ? payload.refresh_token.trim()
      : null;

  return {
    accessToken: payload.access_token.trim(),
    tokenType:
      typeof payload.token_type === 'string' && payload.token_type.length > 0
        ? payload.token_type
        : 'Bearer',
    expiresAt: now + ttlMs,
    // `exactOptionalPropertyTypes` recusa `refreshToken: undefined`: a chave
    // precisa não existir, e não existir valendo undefined.
    ...(refreshToken === null ? {} : { refreshToken }),
  };
}

/**
 * Distingue "o proxy respondeu" de "não há proxy aqui" (AD-10).
 *
 * O caso traiçoeiro não é o 404: é o host estático que responde **200 com o
 * index.html**, porque o SPA fallback pega qualquer caminho desconhecido. Olhar
 * só o status trataria isso como sucesso. Quem responde JSON neste caminho é o
 * AniList do outro lado do proxy — inclusive quando recusa, que é o caso normal
 * de uma sonda.
 */
function respondeComoProxy(response: Response): boolean {
  if (response.status === 404) return false;
  return (response.headers.get('content-type') ?? '').includes('json');
}

export interface ProbeTokenProxyOptions {
  /** Default: `TOKEN_PROXY_PATH`. */
  readonly tokenEndpoint?: string;
  readonly fetcher?: Fetcher;
}

/**
 * Ver RF-07. Responde se esta hospedagem tem o proxy de troca de token.
 *
 * Existe porque descobrir isso pela falha de `exchangeCodeForToken` é tarde
 * demais: a essa altura o usuário já foi ao AniList, já autorizou e já voltou,
 * e o code que ele trouxe é de uso único. Perguntar antes é o que permite à UI
 * oferecer só o caminho que funciona ali (AD-11).
 *
 * O corpo é um `{}` deliberadamente inútil: sem `grant_type`, o AniList recusa
 * com `unsupported_grant_type` — verificado contra a API real. É o que queremos,
 * porque a resposta que interessa é a *forma* dela, não o conteúdo. Sem
 * credencial e sem code no corpo, a sonda não tem como consumir nem vazar nada.
 *
 * Nunca lança: uma falha de rede é indistinguível de ausência de proxy do ponto
 * de vista de quem precisa escolher a tela, e as duas levam ao mesmo lugar.
 */
export async function probeTokenProxy(options: ProbeTokenProxyOptions = {}): Promise<boolean> {
  const fetcher = options.fetcher ?? resolveGlobalFetch();
  const endpoint = options.tokenEndpoint ?? TOKEN_PROXY_PATH;

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
    return respondeComoProxy(response);
  } catch {
    return false;
  }
}

/**
 * Ver RF-03. Troca o authorization code por um access token, via proxy de mesma origem.
 *
 * Lança:
 *   - `TokenExchangeUnavailableError` quando não há proxy (404, ou o SPA fallback
 *     devolvendo HTML no lugar de JSON) — sinal para a UI oferecer colar o token;
 *   - `AuthError` quando o AniList recusa credenciais ou o code;
 *   - `NetworkError` quando o transporte falha.
 */
export async function exchangeCodeForToken(options: ExchangeCodeOptions): Promise<StoredToken> {
  // Mesmo trato do AniListClient: o default é resolvido aqui, na chamada, e não no
  // escopo do módulo — importar o core não pode tocar em global nenhum (RNF-03).
  const fetcher = options.fetcher ?? resolveGlobalFetch();
  const now = options.now ?? (() => Date.now());
  const endpoint = options.tokenEndpoint ?? TOKEN_PROXY_PATH;

  if (options.code.trim().length === 0) {
    throw new AniListError('Authorization code ausente.');
  }
  if (options.clientSecret.trim().length === 0) {
    throw new AuthError('Client Secret não informado. Ver RF-02.');
  }

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: options.clientId.trim(),
        client_secret: options.clientSecret.trim(),
        redirect_uri: options.redirectUri,
        code: options.code.trim(),
      }),
    });
  } catch (cause) {
    throw new NetworkError('Falha de rede ao trocar o authorization code.', { cause });
  }

  if (!respondeComoProxy(response)) {
    throw new TokenExchangeUnavailableError(
      `Não há proxy de troca de token em ${endpoint}. Esta hospedagem não suporta login direto.`,
    );
  }

  let payload: TokenResponse & { error?: unknown; hint?: unknown; message?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch (cause) {
    throw new NetworkError('Resposta ilegível do endpoint de token.', { cause });
  }

  const token = response.ok ? tokenFromPayload(payload, now()) : null;
  if (token === null) {
    const detalhe =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `HTTP ${String(response.status)}`;
    throw new AuthError(`O AniList recusou a troca do código: ${detalhe}`);
  }

  return token;
}

/**
 * Ver RF-04. Constrói um `StoredToken` a partir de um access token colado à mão.
 *
 * Existe para que a política de expiração seja **uma só**, decidida aqui, e não
 * reinventada por cada cliente (web, CLI, APK). A autoridade final continua sendo o
 * 401 da API — este prazo é só o palpite local.
 */
export function tokenFromAccessToken(
  accessToken: string,
  now: number,
  ttlMs: number = ANILIST_TOKEN_TTL_MS,
): StoredToken {
  const trimmed = accessToken.trim();
  if (trimmed.length === 0) {
    throw new AniListError('Access token vazio. Ver RF-04.');
  }

  return { accessToken: trimmed, tokenType: 'Bearer', expiresAt: now + ttlMs };
}

/**
 * Ver RF-08. Aceita o que o usuário colar: a **resposta inteira** do token
 * endpoint, ou só o access token cru.
 *
 * Onde não há proxy, quem faz a troca é o próprio usuário, no console (AD-11), e
 * o que ele tem na mão é um objeto JSON com quatro campos e dois valores enormes
 * e parecidos. Exigir que ele garimpe o `access_token` dali é pedir para colar o
 * `refresh_token` por engano — os dois são strings longas e opacas, e o erro só
 * apareceria depois, como um 401 sem explicação.
 *
 * Aceitar a resposta inteira ainda captura o `refresh_token` de graça (RF-09),
 * que a extração manual jogaria fora.
 */
export function parseTokenResponse(input: string, now: number): StoredToken {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new AniListError('Cole a resposta do AniList ou um access token.');
  }

  // Um access token é um JWT: nunca começa com chave. A heurística é do formato,
  // não do conteúdo, e por isso não precisa acertar sobre o que veio dentro.
  if (!trimmed.startsWith('{')) {
    return tokenFromAccessToken(trimmed, now);
  }

  let payload: TokenResponse & { error?: unknown; message?: unknown };
  try {
    payload = JSON.parse(trimmed) as typeof payload;
  } catch {
    throw new AniListError('A resposta colada não é um JSON válido. Copie o objeto inteiro.');
  }

  const token = tokenFromPayload(payload, now);
  if (token !== null) return token;

  const detalhe =
    typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : null;

  throw detalhe === null
    ? new AniListError('A resposta colada não tem um access_token.')
    : new AuthError(`O AniList recusou a troca: ${detalhe}`);
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
