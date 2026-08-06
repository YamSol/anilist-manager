/**
 * Escopo A — autenticação (RF-01 a RF-06).
 *
 * `packages/core` ainda é stub nesta branch: `parseTokenFragment`,
 * `buildAuthorizeUrl` e `isTokenExpired` lançam. Mockamos só essas três funções,
 * preservando o resto do módulo, para exercitar a camada web contra o contrato
 * congelado em docs/REQUIREMENTS.md §5.4.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as Core from '@anilist-updater/core';
import type { StoredToken } from '@anilist-updater/core';

const { buildAuthorizeUrl, parseTokenFragment, isTokenExpired } = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn<(config: { clientId: string; redirectUri: string }) => string>(),
  parseTokenFragment: vi.fn<(fragment: string, now: number) => StoredToken | null>(),
  isTokenExpired: vi.fn<(token: StoredToken, now: number) => boolean>(),
}));

vi.mock('@anilist-updater/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  buildAuthorizeUrl,
  parseTokenFragment,
  isTokenExpired,
}));

const { consumeAuthFragment, createAuth } = await import('../src/lib/auth.svelte.js');
const { createTokenStore, loadClientId } = await import('../src/lib/tokenStore.js');
const { STORAGE_KEYS } = await import('../src/lib/storage.js');

const TOKEN: StoredToken = {
  accessToken: 'tok-abc',
  tokenType: 'Bearer',
  expiresAt: 4_000_000_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  isTokenExpired.mockReturnValue(false);
  buildAuthorizeUrl.mockReturnValue(
    'https://anilist.co/api/v2/oauth/authorize?response_type=token',
  );
  parseTokenFragment.mockReturnValue(null);
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

describe('RF-02: implicit grant sem secret', () => {
  it('RF-02: entrar monta a URL de autorização com o redirect URI da origem', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.setClientId('12345');
    auth.login();

    expect(buildAuthorizeUrl).toHaveBeenCalledWith({
      clientId: '12345',
      redirectUri: `${location.origin}${location.pathname}`,
    });
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('response_type=token'));
  });

  it('RF-02: sem Client ID não há redirect, e sim uma mensagem', () => {
    const redirect = vi.fn();
    const auth = createAuth({ store: createTokenStore(), redirect });

    auth.login();

    expect(redirect).not.toHaveBeenCalled();
    expect(auth.message).toBe('Informe o Client ID antes de entrar.');
  });
});

describe('RF-03: token no fragmento da URL', () => {
  it('RF-03: o fragmento é lido, o token é salvo e a URL fica limpa', () => {
    history.replaceState(null, '', '/#access_token=tok-abc&token_type=Bearer&expires_in=31536000');
    parseTokenFragment.mockReturnValue(TOKEN);

    const store = createTokenStore();
    const token = consumeAuthFragment(store, 1_000);

    expect(token).toEqual(TOKEN);
    expect(store.load()).toEqual(TOKEN);
    // O access token não pode sobrar na barra de endereços.
    expect(location.hash).toBe('#/lista');
    expect(location.href).not.toContain('access_token');
  });

  it('RF-03: um hash de rota comum não é confundido com retorno de OAuth', () => {
    history.replaceState(null, '', '/#/converter');

    expect(consumeAuthFragment(createTokenStore(), 1_000)).toBeNull();
    expect(parseTokenFragment).not.toHaveBeenCalled();
    // A rota do usuário é preservada intacta.
    expect(location.hash).toBe('#/converter');
  });

  it('RF-03: fragmento sem token reconhecível não autentica nem limpa a rota', () => {
    history.replaceState(null, '', '/#access_token=');
    parseTokenFragment.mockReturnValue(null);

    expect(consumeAuthFragment(createTokenStore(), 1_000)).toBeNull();
    expect(createTokenStore().load()).toBeNull();
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
    auth.pasteToken('tok-abc');
    expect(auth.authenticated).toBe(true);

    auth.logout();

    expect(auth.authenticated).toBe(false);
    expect(store.load()).toBeNull();
    // O Client ID é configuração, não credencial.
    expect(auth.clientId).toBe('12345');
    expect(loadClientId()).toBe('12345');
    expect(localStorage.getItem(STORAGE_KEYS.clientId)).toBe('12345');
  });
});
