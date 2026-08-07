import { describe, expect, it } from 'vitest';

import {
  ANILIST_TOKEN_TTL_MS,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  isTokenExpired,
  parseAuthCallback,
  parseTokenResponse,
  probeTokenProxy,
  TOKEN_PROXY_PATH,
  tokenFromAccessToken,
} from './auth.js';
import { AniListError, AuthError, NetworkError, TokenExchangeUnavailableError } from './errors.js';
import type { Fetcher } from './http.js';

const CONFIG = { clientId: '12345', redirectUri: 'http://localhost:5173/' };

describe('buildAuthorizeUrl', () => {
  it('RF-02: usa o endpoint de authorize do AniList com response_type=code', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG));

    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('12345');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/');
  });

  it('RF-02: NÃO pede response_type=token — o AniList não habilita implicit grant', () => {
    // Regressão do bug real: com response_type=token o AniList devolve
    // {"error":"unsupported_grant_type"} e o login nunca acontece.
    expect(buildAuthorizeUrl(CONFIG)).not.toContain('response_type=token');
  });

  it('RNF-02: o secret não viaja na URL de autorização', () => {
    expect(buildAuthorizeUrl(CONFIG)).not.toContain('client_secret');
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

describe('parseAuthCallback', () => {
  it('RF-03: lê o code da query do retorno', () => {
    expect(parseAuthCallback('?code=abc123')).toEqual({
      code: 'abc123',
      error: null,
      errorDescription: null,
    });
  });

  it('RF-03: aceita a query sem o ? inicial', () => {
    expect(parseAuthCallback('code=abc')?.code).toBe('abc');
  });

  it('RF-03: decodifica valores percent-encoded', () => {
    expect(parseAuthCallback('?code=a%2Bb%3Dc')?.code).toBe('a+b=c');
  });

  it('RF-03: ignora parâmetros alheios ao OAuth que estejam na query', () => {
    expect(parseAuthCallback('?utm=x&code=abc&ref=y')?.code).toBe('abc');
  });

  it('RF-03: recusa do usuário vira error, não code', () => {
    expect(parseAuthCallback('?error=access_denied&error_description=Usuario+negou')).toEqual({
      code: null,
      error: 'access_denied',
      errorDescription: 'Usuario negou',
    });
  });

  it('RF-03: error sem description não inventa texto', () => {
    expect(parseAuthCallback('?error=server_error')?.errorDescription).toBeNull();
  });

  it.each([
    ['vazia', ''],
    ['só o ?', '?'],
    ['só espaços', '   '],
    ['sem code nem error', '?utm_source=x'],
    ['code vazio', '?code='],
    ['malformada', '?=&&&'],
    // O token no fragmento era o formato do implicit grant, que não existe mais.
    ['fragmento de implicit grant', '?access_token=abc'],
  ])('RF-03: query %s devolve null', (_nome, search) => {
    expect(parseAuthCallback(search)).toBeNull();
  });
});

describe('exchangeCodeForToken (RF-03)', () => {
  const NOW = 1_700_000_000_000;
  const BASE = {
    code: 'code-abc',
    clientId: '12345',
    clientSecret: 'segredo-do-usuario',
    redirectUri: 'http://localhost:5173/',
    now: () => NOW,
  };

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('RF-03: troca o code por um token e calcula expiresAt a partir de expires_in', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(
        jsonResponse({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }),
      );

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).resolves.toEqual({
      accessToken: 'tok',
      tokenType: 'Bearer',
      expiresAt: NOW + 3_600_000,
    });
  });

  it('AD-10: posta no proxy de MESMA ORIGEM, nunca direto no anilist.co', async () => {
    let calledUrl = '';
    const fetcher: Fetcher = (url) => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({ access_token: 'tok' }));
    };

    await exchangeCodeForToken({ ...BASE, fetcher });

    // Chamar anilist.co direto é justamente o que o browser não consegue fazer:
    // o endpoint não manda CORS.
    expect(calledUrl).toBe(TOKEN_PROXY_PATH);
    expect(calledUrl).not.toContain('anilist.co');
  });

  it('RF-03: envia grant_type=authorization_code com as credenciais do usuário', async () => {
    let body: Record<string, unknown> = {};
    const fetcher: Fetcher = (_url, init) => {
      // O corpo é sempre string aqui: exchangeCodeForToken serializa com
      // JSON.stringify antes de chamar o fetcher.
      body = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve(jsonResponse({ access_token: 'tok' }));
    };

    await exchangeCodeForToken({ ...BASE, fetcher });

    expect(body).toEqual({
      grant_type: 'authorization_code',
      client_id: '12345',
      client_secret: 'segredo-do-usuario',
      redirect_uri: 'http://localhost:5173/',
      code: 'code-abc',
    });
  });

  it('RF-03: sem expires_in, assume a validade de um ano do AniList', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ access_token: 'tok' }));

    const token = await exchangeCodeForToken({ ...BASE, fetcher });

    expect(token.expiresAt).toBe(NOW + ANILIST_TOKEN_TTL_MS);
  });

  it('RF-03: assume Bearer quando token_type não vem', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ access_token: 'tok' }));

    expect((await exchangeCodeForToken({ ...BASE, fetcher })).tokenType).toBe('Bearer');
  });

  it('RF-09: guarda o refresh_token que o AniList devolve junto', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(jsonResponse({ access_token: 'tok', refresh_token: 'def502-refresh' }));

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).resolves.toMatchObject({
      accessToken: 'tok',
      refreshToken: 'def502-refresh',
    });
  });

  it('RF-09: sem refresh_token, a CHAVE não existe — não vale undefined', async () => {
    // `exactOptionalPropertyTypes` distingue os dois, e o storage também: uma
    // chave com undefined some no JSON.stringify e volta diferente do que saiu.
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ access_token: 'tok' }));

    const token = await exchangeCodeForToken({ ...BASE, fetcher });

    expect('refreshToken' in token).toBe(false);
  });

  it('RF-09: refresh_token em branco é tratado como ausente', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(jsonResponse({ access_token: 'tok', refresh_token: '   ' }));

    expect('refreshToken' in (await exchangeCodeForToken({ ...BASE, fetcher }))).toBe(false);
  });

  it('RF-05: access_token só de espaços é recusa, não token', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ access_token: '   ' }));

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(AuthError);
  });

  it('AD-10: 404 no endpoint significa hospedagem sem proxy', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ erro: 'nao encontrado' }, 404));

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(
      TokenExchangeUnavailableError,
    );
  });

  it('AD-10: HTML com status 200 é o SPA fallback, não um token', async () => {
    // Sem proxy, um host estático responde 200 com o index.html. Checar só o
    // status trataria isso como sucesso e o erro apareceria longe da causa.
    const fetcher: Fetcher = () =>
      Promise.resolve(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(
      TokenExchangeUnavailableError,
    );
  });

  it('RF-05: credencial recusada vira AuthError, não erro de ambiente', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(
        jsonResponse({ error: 'invalid_client', message: 'Client authentication failed' }, 401),
      );

    const promise = exchangeCodeForToken({ ...BASE, fetcher });

    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toThrow(/Client authentication failed/);
  });

  it('RF-05: 200 sem access_token também é recusa', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ error: 'invalid_grant' }));

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(AuthError);
  });

  it('RF-05: secret em branco falha antes de qualquer ida à rede', async () => {
    let chamou = false;
    const fetcher: Fetcher = () => {
      chamou = true;
      return Promise.resolve(jsonResponse({ access_token: 'tok' }));
    };

    await expect(
      exchangeCodeForToken({ ...BASE, clientSecret: '  ', fetcher }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(chamou).toBe(false);
  });

  it('code em branco falha antes de qualquer ida à rede', async () => {
    const fetcher: Fetcher = () => Promise.resolve(jsonResponse({ access_token: 'tok' }));

    await expect(exchangeCodeForToken({ ...BASE, code: '  ', fetcher })).rejects.toBeInstanceOf(
      AniListError,
    );
  });

  it('falha de transporte vira NetworkError', async () => {
    const fetcher: Fetcher = () => Promise.reject(new Error('offline'));

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(NetworkError);
  });

  it('corpo ilegível vira NetworkError', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(
        new Response('{quebrado', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

    await expect(exchangeCodeForToken({ ...BASE, fetcher })).rejects.toBeInstanceOf(NetworkError);
  });

  it('respeita um tokenEndpoint customizado', async () => {
    let calledUrl = '';
    const fetcher: Fetcher = (url) => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({ access_token: 'tok' }));
    };

    await exchangeCodeForToken({ ...BASE, tokenEndpoint: '/api/troca', fetcher });

    expect(calledUrl).toBe('/api/troca');
  });
});

describe('probeTokenProxy (RF-07)', () => {
  function resposta(body: string, status: number, contentType: string): Response {
    return new Response(body, { status, headers: { 'Content-Type': contentType } });
  }

  it('RF-07: a recusa do AniList em JSON prova que há proxy', async () => {
    // Foi o que a API real devolveu à sonda: 400 + JSON. A sonda quer a forma da
    // resposta, não o conteúdo — recusa é resultado esperado, não falha.
    const fetcher: Fetcher = () =>
      Promise.resolve(resposta('{"error":"unsupported_grant_type"}', 400, 'application/json'));

    await expect(probeTokenProxy({ fetcher })).resolves.toBe(true);
  });

  it('RF-07: 404 é hospedagem sem proxy', async () => {
    const fetcher: Fetcher = () => Promise.resolve(resposta('nao encontrado', 404, 'text/plain'));

    await expect(probeTokenProxy({ fetcher })).resolves.toBe(false);
  });

  it('AD-10: 200 com HTML é o SPA fallback, não um proxy', async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(resposta('<!doctype html><html></html>', 200, 'text/html'));

    await expect(probeTokenProxy({ fetcher })).resolves.toBe(false);
  });

  it('RF-07: falha de rede responde "sem proxy" em vez de lançar', async () => {
    // Quem chama precisa escolher uma tela, não tratar exceção: rede caída e
    // ausência de proxy levam ao mesmo caminho.
    const fetcher: Fetcher = () => Promise.reject(new Error('offline'));

    await expect(probeTokenProxy({ fetcher })).resolves.toBe(false);
  });

  it('RNF-02: a sonda não leva credencial nem authorization code no corpo', async () => {
    let body = '';
    const fetcher: Fetcher = (_url, init) => {
      body = init.body as string;
      return Promise.resolve(resposta('{}', 400, 'application/json'));
    };

    await probeTokenProxy({ fetcher });

    expect(JSON.parse(body)).toEqual({});
  });

  it('AD-10: sonda o proxy de mesma origem, nunca o anilist.co', async () => {
    let calledUrl = '';
    const fetcher: Fetcher = (url) => {
      calledUrl = url;
      return Promise.resolve(resposta('{}', 400, 'application/json'));
    };

    await probeTokenProxy({ fetcher });

    expect(calledUrl).toBe(TOKEN_PROXY_PATH);
  });

  it('respeita um tokenEndpoint customizado', async () => {
    let calledUrl = '';
    const fetcher: Fetcher = (url) => {
      calledUrl = url;
      return Promise.resolve(resposta('{}', 400, 'application/json'));
    };

    await probeTokenProxy({ tokenEndpoint: '/base/oauth/token', fetcher });

    expect(calledUrl).toBe('/base/oauth/token');
  });
});

describe('parseTokenResponse (RF-08)', () => {
  const NOW = 1_700_000_000_000;

  it('RF-08: aceita a resposta inteira do AniList, do jeito que ela sai do console', () => {
    const colado = JSON.stringify({
      token_type: 'Bearer',
      expires_in: 31_536_000,
      access_token: 'eyJ0eXAiOiJKV1Qi',
      refresh_token: 'def502-refresh',
    });

    expect(parseTokenResponse(colado, NOW)).toEqual({
      accessToken: 'eyJ0eXAiOiJKV1Qi',
      tokenType: 'Bearer',
      expiresAt: NOW + 31_536_000_000,
      refreshToken: 'def502-refresh',
    });
  });

  it('RF-04: um access token cru continua valendo', () => {
    expect(parseTokenResponse('eyJ0eXAiOiJKV1Qi', NOW)).toEqual({
      accessToken: 'eyJ0eXAiOiJKV1Qi',
      tokenType: 'Bearer',
      expiresAt: NOW + ANILIST_TOKEN_TTL_MS,
    });
  });

  it('RF-08: tolera espaço e quebra de linha em volta do JSON colado', () => {
    const colado = `\n  {"access_token":"tok"}  \n`;

    expect(parseTokenResponse(colado, NOW).accessToken).toBe('tok');
  });

  it('RF-08: a recusa do AniList colada vira AuthError com o motivo dele', () => {
    const colado = '{"error":"invalid_grant","message":"Authorization code has expired"}';

    expect(() => parseTokenResponse(colado, NOW)).toThrow(AuthError);
    expect(() => parseTokenResponse(colado, NOW)).toThrow(/Authorization code has expired/);
  });

  it('RF-31: JSON quebrado tem erro legível, não crash', () => {
    expect(() => parseTokenResponse('{"access_token":', NOW)).toThrow(AniListError);
    expect(() => parseTokenResponse('{"access_token":', NOW)).toThrow(/JSON válido/);
  });

  it('JSON sem access_token nem erro declarado ainda é recusado', () => {
    expect(() => parseTokenResponse('{"token_type":"Bearer"}', NOW)).toThrow(AniListError);
  });

  it('entrada em branco é recusada', () => {
    expect(() => parseTokenResponse('   ', NOW)).toThrow(AniListError);
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

  it('RF-03: o token recém-trocado não nasce expirado', () => {
    const now = 5_000;
    const token = tokenFromAccessToken('abc', now, 3_600_000);

    expect(isTokenExpired(token, now)).toBe(false);
  });
});

describe('tokenFromAccessToken (RF-04)', () => {
  const AGORA = 1_700_000_000_000;

  it('RF-04: monta um StoredToken a partir do texto colado', () => {
    expect(tokenFromAccessToken('abc123', AGORA)).toEqual({
      accessToken: 'abc123',
      tokenType: 'Bearer',
      expiresAt: AGORA + ANILIST_TOKEN_TTL_MS,
    });
  });

  it('RF-04: apara espaços em volta do token colado', () => {
    expect(tokenFromAccessToken('  abc123\n', AGORA).accessToken).toBe('abc123');
  });

  it('RF-04: token em branco é recusado', () => {
    expect(() => tokenFromAccessToken('   ', AGORA)).toThrow(AniListError);
  });

  it('RF-04: aceita um ttl explícito', () => {
    expect(tokenFromAccessToken('abc', AGORA, 5_000).expiresAt).toBe(AGORA + 5_000);
  });

  it('RF-04: o token gerado só expira depois do prazo', () => {
    const token = tokenFromAccessToken('abc', AGORA);

    expect(isTokenExpired(token, AGORA + ANILIST_TOKEN_TTL_MS - 1)).toBe(false);
    expect(isTokenExpired(token, AGORA + ANILIST_TOKEN_TTL_MS)).toBe(true);
  });
});
