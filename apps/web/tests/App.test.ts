/**
 * Casca da aplicação: portão de autenticação e roteamento por hash.
 *
 * O caso que mais importa é o RF-03: o token chega no MESMO fragmento que o
 * roteador usa, e o boot precisa consumi-lo antes de rotear.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';
import type { StoredToken } from '@anilist-updater/core';

const { parseTokenFragment, isTokenExpired } = vi.hoisted(() => ({
  parseTokenFragment: vi.fn<(fragment: string, now: number) => StoredToken | null>(),
  isTokenExpired: vi.fn<() => boolean>(),
}));

vi.mock('@anilist-updater/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    parseTokenFragment,
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
const { createTokenStore, saveClientId, loadClientId } = await import('../src/lib/tokenStore.js');

const TOKEN: StoredToken = {
  accessToken: 'tok-abc',
  tokenType: 'Bearer',
  expiresAt: 4_000_000_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  isTokenExpired.mockReturnValue(false);
  parseTokenFragment.mockReturnValue(null);
});

describe('App', () => {
  it('sem token, mostra a tela de setup', () => {
    render(App, {});

    expect(screen.getByRole('heading', { name: 'AniList Manager', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
  });

  it('RF-03: o token do fragmento é consumido no boot e a URL fica limpa', async () => {
    history.replaceState(null, '', '/#access_token=tok-abc&token_type=Bearer&expires_in=31536000');
    parseTokenFragment.mockReturnValue(TOKEN);

    render(App, {});

    // Entrou direto na aplicação, sem passar pela tela de login.
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument();
    });
    expect(location.hash).toBe('#/lista');
    expect(location.href).not.toContain('access_token');
    expect(createTokenStore().load()).toEqual(TOKEN);
  });

  it('RF-03: um hash de rota comum leva à tela certa, sem virar login', async () => {
    createTokenStore().save(TOKEN);
    history.replaceState(null, '', '/#/converter');

    render(App, {});

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Converter a escala de prioridade' }),
      ).toBeInTheDocument();
    });
    expect(parseTokenFragment).not.toHaveBeenCalled();
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
  });

  it('RF-10: autenticado, carrega a lista e mostra a grid', async () => {
    createTokenStore().save(TOKEN);
    render(App, {});

    await waitFor(() => {
      expect(screen.getByText('Sword Art Online')).toBeInTheDocument();
    });
  });
});
