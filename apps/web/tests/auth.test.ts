/**
 * Escopo A — autenticação (RF-01 a RF-06).
 *
 * As funções do core viram espiãs para que estes testes verifiquem a *fiação* da
 * camada web — quem é chamado, com quê, e o que a UI faz com o resultado. O
 * comportamento das funções em si é coberto em `packages/core/src/auth.test.ts`.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as Core from '@anilist-updater/core';
import type { StoredToken } from '@anilist-updater/core';
import { AuthError, TokenExchangeUnavailableError } from '@anilist-updater/core';

const { buildAuthorizeUrl, exchangeCodeForToken, isTokenExpired } = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn<(config: { clientId: string; redirectUri: string }) => string>(),
  exchangeCodeForToken: vi.fn<() => Promise<StoredToken>>(),
  isTokenExpired: vi.fn<(token: StoredToken, now: number) => boolean>(),
}));

vi.mock('@anilist-updater/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  buildAuthorizeUrl,
  exchangeCodeForToken,
  isTokenExpired,
}));

const { consumeAuthCallback, createAuth } = await import('../src/lib/auth.svelte.js');
const { createTokenStore, loadClientId, saveClientSecret, loadClientSecret } =
  await import('../src/lib/tokenStore.js');
const { STORAGE_KEYS } = await import('../src/lib/storage.js');

const TOKEN: StoredToken = {
  accessToken: 'tok-abc',
  tokenType: 'Bearer',
  expiresAt: 4_000_000_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  isTokenExpired.mockReturnValue(false);
  buildAuthorizeUrl.mockReturnValue('https://anilist.co/api/v2/oauth/authorize?response_type=code');
  exchangeCodeForToken.mockResolvedValue(TOKEN);
  history.replaceState(null, '', '/');
});

describe('TokenStore sobre localStorage (§5.4)', () => {
  it('persiste, recupera e apaga o token', () => {
    const store = createTokenStore();
    expect(store.load()).toBeNull();

    store.save(TOKEN);
    expect(store.load()).toEqual(TOKEN);

    store.clear();
    expect(store.load()).toBeNull();
  });

  it('ignora conteúdo corrompido no storage em vez de lançar', () => {
    localStorage.setItem(STORAGE_KEYS.token, '{ isso não é json');
    expect(createTokenStore().load()).toBeNull();

    localStorage.setItem(STORAGE_KEYS.token, JSON.stringify({ accessToken: 42 }));
    expect(createTokenStore().load()).toBeNull();
  });
});

describe('RF-01: Client ID informado pelo usuário', () => {
  it('RF-01: o Client ID persiste entre sessões', () => {
    const auth = createAuth({ store: createTokenStore() });
    auth.setClientId('  98765  ');

    expect(auth.clientId).toBe('98765');
    // "Recarregar a página" = ler o storage do zero.
    expect(loadClientId()).toBe('98765');
  });
});

describe('RF-02: authorization code grant', () => {
  it('RF-02: entrar monta a URL de autorização com o redirect URI da origem', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.setClientId('12345');
    auth.setClientSecret('segredo');
    auth.login();

    expect(buildAuthorizeUrl).toHaveBeenCalledWith({
      clientId: '12345',
      redirectUri: `${location.origin}${location.pathname}`,
    });
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('response_type=code'));
  });

  it('RNF-02: o secret não vai na URL de autorização — só na troca do código', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.setClientId('12345');
    auth.setClientSecret('segredo-do-usuario');
    auth.login();

    expect(redirect).toHaveBeenCalledWith(expect.not.stringContaining('segredo-do-usuario'));
  });

  it('RF-02: sem Client ID não há redirect, e sim uma mensagem', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.login();

    expect(redirect).not.toHaveBeenCalled();
    expect(auth.message).toBe('Informe o Client ID antes de entrar.');
  });

  it('RF-02: sem Client Secret também não há redirect — a troca do código exige o secret', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.setClientId('12345');
    auth.login();

    expect(redirect).not.toHaveBeenCalled();
    expect(auth.message).toContain('Client Secret');
  });
});

describe('RF-03: retorno do OAuth na query', () => {
  it('RF-03: o code é trocado por token, salvo, e a URL fica limpa', async () => {
    history.replaceState(null, '', '/?code=code-abc');
    saveClientSecret('segredo');
    exchangeCodeForToken.mockResolvedValue(TOKEN);

    const store = createTokenStore();
    const outcome = await consumeAuthCallback(store);

    expect(outcome?.token).toEqual(TOKEN);
    expect(store.load()).toEqual(TOKEN);
    // Nem o code nem o token podem sobrar na barra de endereços.
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/lista');
  });

  it('RF-03: uma rota comum não é confundida com retorno de OAuth', async () => {
    history.replaceState(null, '', '/#/converter');

    expect(await consumeAuthCallback(createTokenStore())).toBeNull();
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
    // A rota do usuário é preservada intacta.
    expect(location.hash).toBe('#/converter');
  });

  it('RF-03: recusa do usuário vira mensagem sem tentar trocar nada', async () => {
    history.replaceState(null, '', '/?error=access_denied&error_description=Voce+recusou');

    const outcome = await consumeAuthCallback(createTokenStore());

    expect(outcome?.token).toBeNull();
    expect(outcome?.message).toBe('Voce recusou');
    expect(outcome?.needsManualToken).toBe(false);
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('AD-10: sem proxy, o desfecho pede o token colado em vez de culpar o usuário', async () => {
    history.replaceState(null, '', '/?code=code-abc');
    saveClientSecret('segredo');
    exchangeCodeForToken.mockRejectedValue(new TokenExchangeUnavailableError('sem proxy'));

    const outcome = await consumeAuthCallback(createTokenStore());

    expect(outcome?.token).toBeNull();
    expect(outcome?.needsManualToken).toBe(true);
    expect(createTokenStore().load()).toBeNull();
  });

  it('RF-05: credencial recusada NÃO vira pedido de token colado', async () => {
    history.replaceState(null, '', '/?code=code-abc');
    saveClientSecret('segredo-errado');
    exchangeCodeForToken.mockRejectedValue(new AuthError('Client authentication failed'));

    const outcome = await consumeAuthCallback(createTokenStore());

    // A distinção importa: aqui o caminho é corrigir o secret, não colar token.
    expect(outcome?.needsManualToken).toBe(false);
    expect(outcome?.message).toBeTruthy();
  });

  it('RF-03: sem secret guardado, a troca nem é tentada', async () => {
    history.replaceState(null, '', '/?code=code-abc');

    const outcome = await consumeAuthCallback(createTokenStore());

    expect(exchangeCodeForToken).not.toHaveBeenCalled();
    expect(outcome?.needsManualToken).toBe(true);
    expect(location.search).toBe('');
  });
});

describe('RF-04: colar access token manualmente', () => {
  it('RF-04: colar um token autentica sem passar pelo redirect', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect, now: () => 1_000 });

    expect(auth.authenticated).toBe(false);
    expect(auth.pasteToken('  tok-colado  ')).toBe(true);

    expect(auth.authenticated).toBe(true);
    expect(auth.token?.accessToken).toBe('tok-colado');
    expect(auth.token?.expiresAt).toBeGreaterThan(1_000);
    expect(redirect).not.toHaveBeenCalled();
    expect(createTokenStore().load()?.accessToken).toBe('tok-colado');
  });

  it('RF-04: token vazio não autentica e explica o motivo', () => {
    const auth = createAuth({ store: createTokenStore() });

    expect(auth.pasteToken('   ')).toBe(false);
    expect(auth.authenticated).toBe(false);
    expect(auth.message).toBe('Cole um access token válido.');
  });
});

describe('RF-05: token expirado volta ao login', () => {
  it('RF-05: um token vencido no storage é descartado no boot, com mensagem', () => {
    const store = createTokenStore();
    store.save(TOKEN);
    isTokenExpired.mockReturnValue(true);

    const auth = createAuth({ store });

    expect(auth.authenticated).toBe(false);
    expect(auth.message).toBe('Sua sessão expirou. Entre novamente.');
    expect(store.load()).toBeNull();
  });
});

describe('RF-06: sair', () => {
  it('RF-06: sair apaga o token mas preserva o Client ID', () => {
    const store = createTokenStore();
    const auth = createAuth({ store });

    auth.setClientId('12345');
    auth.setClientSecret('segredo');
    auth.pasteToken('tok-abc');
    expect(auth.authenticated).toBe(true);

    auth.logout();

    expect(auth.authenticated).toBe(false);
    expect(store.load()).toBeNull();
    // O Client ID é configuração, não credencial.
    expect(auth.clientId).toBe('12345');
    expect(loadClientId()).toBe('12345');
    expect(localStorage.getItem(STORAGE_KEYS.clientId)).toBe('12345');
    // O Client Secret É credencial e some junto com o token.
    expect(auth.clientSecret).toBe('');
    expect(loadClientSecret()).toBe('');
    expect(localStorage.getItem(STORAGE_KEYS.clientSecret)).toBeNull();
  });
});
