/**
 * Tela de setup e login (RF-01 a RF-06), exercitada pelo DOM.
 *
 * `packages/core` é stub nesta branch, então `buildAuthorizeUrl` é mockado.
 * O resto do módulo é preservado.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';

const { buildAuthorizeUrl, isTokenExpired } = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn<() => string>(),
  isTokenExpired: vi.fn<() => boolean>(),
}));

vi.mock('@anilist-updater/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  buildAuthorizeUrl,
  isTokenExpired,
}));

const AuthScreen = (await import('../src/routes/AuthScreen.svelte')).default;
const { createAuth } = await import('../src/lib/auth.svelte.js');
const { loadClientId } = await import('../src/lib/tokenStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  isTokenExpired.mockReturnValue(false);
  buildAuthorizeUrl.mockReturnValue(
    'https://anilist.co/api/v2/oauth/authorize?response_type=token',
  );
});

describe('AuthScreen', () => {
  it('RF-01: mostra o Redirect URI que o usuário precisa registrar no AniList', () => {
    render(AuthScreen, { auth: createAuth({ redirect: vi.fn() }) });

    expect(
      screen.getByRole('link', { name: /anilist.co\/settings\/developer/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(`${location.origin}${location.pathname}`)).toBeInTheDocument();
  });

  it('RF-01: o Client ID digitado é persistido ao entrar', async () => {
    const user = userEvent.setup();
    const redirect = vi.fn();
    render(AuthScreen, { auth: createAuth({ redirect }) });

    await user.type(screen.getByLabelText('Client ID'), '24680');
    await user.click(screen.getByRole('button', { name: 'Entrar com AniList' }));

    expect(loadClientId()).toBe('24680');
    expect(redirect).toHaveBeenCalledOnce();
  });

  it('RF-01: sem Client ID o botão de entrar fica desabilitado', () => {
    render(AuthScreen, { auth: createAuth({ redirect: vi.fn() }) });

    expect(screen.getByRole('button', { name: 'Entrar com AniList' })).toBeDisabled();
  });

  it('RF-04: colar um access token autentica sem redirect', async () => {
    const user = userEvent.setup();
    const redirect = vi.fn();
    const auth = createAuth({ redirect });
    render(AuthScreen, { auth });

    await user.click(screen.getByRole('button', { name: 'Colar token manualmente' }));
    await user.type(screen.getByLabelText('Access token'), 'tok-colado');
    await user.click(screen.getByRole('button', { name: 'Usar este token' }));

    expect(auth.authenticated).toBe(true);
    expect(auth.token?.accessToken).toBe('tok-colado');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('RF-05: a mensagem de sessão expirada aparece como alerta', () => {
    const auth = createAuth({ redirect: vi.fn() });
    auth.setMessage('Sua sessão expirou. Entre novamente.');

    render(AuthScreen, { auth });

    expect(screen.getByRole('alert')).toHaveTextContent('Sua sessão expirou. Entre novamente.');
  });
});
