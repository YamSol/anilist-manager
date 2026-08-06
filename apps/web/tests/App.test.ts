/**
 * Casca da aplicação: portão de autenticação e roteamento por hash.
 *
 * O caso que mais importa é o RF-03: o retorno do OAuth chega em `?code=…` na
 * query e precisa ser trocado por um token antes de a aplicação abrir.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';
import type { StoredToken } from '@anilist-updater/core';

const { exchangeCodeForToken, isTokenExpired } = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn<() => Promise<StoredToken>>(),
  isTokenExpired: vi.fn<() => boolean>(),
}));

vi.mock('@anilist-updater/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    exchangeCodeForToken,
    isTokenExpired,
    // O cliente real nem é construído nos testes da casca.
    AniListClient: class {
      getViewerId(): Promise<number> {
        return Promise.resolve(1);
      }
      getAnimeList(): Promise<Core.AnimeEntry[]> {
        return Promise.resolve([...SAMPLE_ENTRIES]);
      }
      setPriority(): Promise<void> {
        return Promise.resolve();
      }
    },
  };
});

const { SAMPLE_ENTRIES } = await import('../src/lib/fixtures.js');
const App = (await import('../src/App.svelte')).default;
const { createTokenStore, saveClientId, loadClientId, saveClientSecret, loadClientSecret } =
  await import('../src/lib/tokenStore.js');

const TOKEN: StoredToken = {
  accessToken: 'tok-abc',
  tokenType: 'Bearer',
  expiresAt: 4_000_000_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  isTokenExpired.mockReturnValue(false);
  exchangeCodeForToken.mockResolvedValue(TOKEN);
  history.replaceState(null, '', '/');
});

describe('App', () => {
  it('sem token, mostra a tela de setup', () => {
    render(App, {});

    expect(screen.getByRole('heading', { name: 'AniList Manager', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
  });

  it('RF-03: o code da query é trocado por token no boot e a URL fica limpa', async () => {
    saveClientSecret('segredo');
    history.replaceState(null, '', '/?code=code-abc');

    render(App, {});

    // Entrou direto na aplicação, sem passar pela tela de login.
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument();
    });
    expect(location.search).toBe('');
    expect(location.href).not.toContain('code=');
    expect(location.hash).toBe('#/lista');
    expect(createTokenStore().load()).toEqual(TOKEN);
  });

  it('RF-03: sem code na query, nenhuma troca é tentada', async () => {
    createTokenStore().save(TOKEN);
    history.replaceState(null, '', '/#/converter');

    render(App, {});

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Converter a escala de prioridade' }),
      ).toBeInTheDocument();
    });
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('AD-10: sem proxy, a falha da troca leva a colar token em vez de tela branca', async () => {
    const { TokenExchangeUnavailableError } = await import('@anilist-updater/core');
    saveClientSecret('segredo');
    exchangeCodeForToken.mockRejectedValue(new TokenExchangeUnavailableError('sem proxy'));
    history.replaceState(null, '', '/?code=code-abc');

    render(App, {});

    await waitFor(() => {
      expect(screen.getByLabelText('Access token')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(location.search).toBe('');
  });

  it('RF-03: recusa do usuário no AniList vira mensagem, não travamento', async () => {
    history.replaceState(null, '', '/?error=access_denied&error_description=Voce+recusou');

    render(App, {});

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Voce recusou');
    });
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('navega entre as três telas pelo hash', async () => {
    const user = userEvent.setup();
    createTokenStore().save(TOKEN);
    render(App, {});

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('link', { name: 'Snapshot e diff' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Snapshot e diff' })).toBeInTheDocument();
    });
    expect(location.hash).toBe('#/snapshot');

    await user.click(screen.getByRole('link', { name: 'Converter escala' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Converter a escala de prioridade' }),
      ).toBeInTheDocument();
    });
  });

  it('RF-06: sair volta ao login e preserva o Client ID', async () => {
    const user = userEvent.setup();
    saveClientId('13579');
    saveClientSecret('segredo-que-deve-sumir');
    createTokenStore().save(TOKEN);
    render(App, {});

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    });
    expect(createTokenStore().load()).toBeNull();
    expect(loadClientId()).toBe('13579');
    expect(screen.getByLabelText('Client ID')).toHaveValue('13579');
    // RF-06: o secret é credencial e some junto com o token; o Client ID, não.
    expect(loadClientSecret()).toBe('');
  });

  it('RF-10: autenticado, carrega a lista e mostra a grid', async () => {
    createTokenStore().save(TOKEN);
    render(App, {});

    await waitFor(() => {
      expect(screen.getByText('Sword Art Online')).toBeInTheDocument();
    });
  });
});
