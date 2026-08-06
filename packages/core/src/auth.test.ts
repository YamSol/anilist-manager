import { describe, expect, it } from 'vitest';

import {
  buildAuthorizeUrl,
  DEFAULT_TOKEN_TTL_MS,
  isTokenExpired,
  parseTokenFragment,
} from './auth.js';
import { AniListError } from './errors.js';

const CONFIG = { clientId: '12345', redirectUri: 'http://localhost:5173/' };

describe('buildAuthorizeUrl', () => {
  it('RF-02: usa o endpoint de authorize do AniList com response_type=token', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG));

    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('client_id')).toBe('12345');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/');
  });

  it('RNF-02: a URL não carrega client_secret nem pede um code', () => {
    const url = buildAuthorizeUrl(CONFIG);

    expect(url).not.toContain('client_secret');
    expect(url).not.toContain('response_type=code');
  });

  it('RF-02: escapa a redirect URI em vez de concatenar cru', () => {
    const url = new URL(
      buildAuthorizeUrl({ ...CONFIG, redirectUri: 'http://localhost:5173/cb?x=1&y=2' }),
    );

    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/cb?x=1&y=2');
  });

  it('RF-02: apara espaços do client id colado pelo usuário', () => {
    const url = new URL(buildAuthorizeUrl({ ...CONFIG, clientId: '  12345  ' }));

    expect(url.searchParams.get('client_id')).toBe('12345');
  });

  it('RF-01: client id vazio lança AniListError em vez de gerar URL quebrada', () => {
    expect(() => buildAuthorizeUrl({ ...CONFIG, clientId: '   ' })).toThrow(AniListError);
  });

  it('RF-02: redirect URI vazia lança AniListError', () => {
    expect(() => buildAuthorizeUrl({ ...CONFIG, redirectUri: '' })).toThrow(AniListError);
  });
});

describe('parseTokenFragment', () => {
  const NOW = 1_700_000_000_000;

  it('RF-03: lê um fragmento válido e calcula expiresAt a partir de expires_in', () => {
    const token = parseTokenFragment('#access_token=abc123&token_type=Bearer&expires_in=3600', NOW);

    expect(token).toEqual({
      accessToken: 'abc123',
      tokenType: 'Bearer',
      expiresAt: NOW + 3_600_000,
    });
  });

  it('RF-03: aceita o fragmento sem o # inicial', () => {
    const token = parseTokenFragment('access_token=abc&expires_in=10', NOW);

    expect(token?.accessToken).toBe('abc');
  });

  it('RF-03: assume Bearer quando token_type não vem', () => {
    expect(parseTokenFragment('#access_token=abc&expires_in=10', NOW)?.tokenType).toBe('Bearer');
  });

  it.each([
    ['ausente', '#access_token=abc'],
    ['vazio', '#access_token=abc&expires_in='],
    ['não numérico', '#access_token=abc&expires_in=daqui-a-pouco'],
    ['negativo', '#access_token=abc&expires_in=-5'],
    ['zero', '#access_token=abc&expires_in=0'],
  ])('RF-03: expires_in %s cai no TTL conservador padrão', (_nome, fragment) => {
    expect(parseTokenFragment(fragment, NOW)?.expiresAt).toBe(NOW + DEFAULT_TOKEN_TTL_MS);
  });

  it('RF-03: decodifica valores percent-encoded', () => {
    const token = parseTokenFragment('#access_token=a%2Bb%3Dc&expires_in=10', NOW);

    expect(token?.accessToken).toBe('a+b=c');
  });

  it.each([
    ['vazio', ''],
    ['só o #', '#'],
    ['só espaços', '   '],
    ['sem access_token', '#token_type=Bearer&expires_in=3600'],
    ['access_token vazio', '#access_token=&expires_in=3600'],
    ['malformado', '#=&&&?????'],
    ['erro do OAuth', '#error=access_denied&error_description=nope'],
  ])('RF-03: fragmento %s devolve null', (_nome, fragment) => {
    expect(parseTokenFragment(fragment, NOW)).toBeNull();
  });
});

describe('isTokenExpired', () => {
  const token = { accessToken: 'abc', tokenType: 'Bearer', expiresAt: 1000 };

  it('RF-05: token dentro da validade não está expirado', () => {
    expect(isTokenExpired(token, 999)).toBe(false);
  });

  it('RF-05: no instante exato da expiração já conta como expirado', () => {
    expect(isTokenExpired(token, 1000)).toBe(true);
  });

  it('RF-05: depois da expiração, expirado', () => {
    expect(isTokenExpired(token, 1001)).toBe(true);
  });

  it('RF-03: o token recém-parseado não nasce expirado', () => {
    const now = 5_000;
    const parsed = parseTokenFragment('#access_token=abc&expires_in=3600', now);

    expect(parsed).not.toBeNull();
    expect(isTokenExpired(parsed!, now)).toBe(false);
  });
});
