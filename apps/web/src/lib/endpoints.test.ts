import { describe, expect, it } from 'vitest';

import { TOKEN_PROXY_PATH } from '@anilist-updater/core';
import { resolveTokenEndpoint } from './endpoints.js';

describe('resolveTokenEndpoint (RF-07)', () => {
  it('na raiz, é o próprio caminho do core — dev, preview e container', () => {
    expect(resolveTokenEndpoint('/')).toBe(TOKEN_PROXY_PATH);
  });

  it('AD-10: sob subcaminho, fica DENTRO do app e não na raiz do domínio', () => {
    // Em https://yamsol.github.io/anilist-manager.github.io/, um /oauth/token
    // absoluto perguntaria à raiz do domínio, que é outro site.
    expect(resolveTokenEndpoint('/anilist-manager.github.io/')).toBe(
      '/anilist-manager.github.io/oauth/token',
    );
  });

  it('tolera base sem a barra final, que o vite garante mas o ambiente não', () => {
    expect(resolveTokenEndpoint('/app')).toBe('/app/oauth/token');
  });

  it('não produz barra dobrada com base redundante', () => {
    expect(resolveTokenEndpoint('//')).toBe(TOKEN_PROXY_PATH);
  });
});
