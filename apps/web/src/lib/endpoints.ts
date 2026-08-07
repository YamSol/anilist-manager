/**
 * Onde, nesta instalação, fica o proxy de troca de token (AD-10).
 *
 * O core declara `TOKEN_PROXY_PATH` como um caminho absoluto, o que basta para
 * dev, `vite preview` e o container nginx — todos servem na raiz. O GitHub Pages
 * é o caso desviante: um project site vive num subcaminho, e ali `/oauth/token`
 * não aponta para dentro do app, aponta para a **raiz do domínio**, que pertence
 * a outro site. Sondar lá é perguntar sobre a hospedagem errada.
 *
 * Como o prefixo é do build e não do core (RNF-03), a costura mora aqui.
 */

import { TOKEN_PROXY_PATH } from '@anilist-updater/core';

/**
 * Ver RF-07. O caminho do proxy dentro do escopo desta instalação.
 *
 * `base` é injetável para teste: `import.meta.env.BASE_URL` é resolvido em tempo
 * de build e não dá para variar dentro de uma suíte.
 */
export function resolveTokenEndpoint(base: string = import.meta.env.BASE_URL): string {
  // O vite garante a barra no fim; não confiamos nisso porque `BASE_PATH` também
  // é aceita direto do ambiente por quem builda fora do npm script.
  const prefixo = base.replace(/\/+$/, '');
  return `${prefixo}${TOKEN_PROXY_PATH}`;
}
