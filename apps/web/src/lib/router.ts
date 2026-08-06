/**
 * Roteamento por hash — parte pura, sem runes e sem `location`.
 *
 * Não instalamos um router: são três rotas e a dependência não está declarada.
 *
 * CUIDADO COM A ORDEM (RF-03): o implicit grant devolve o token no MESMO
 * fragmento que usamos para rotear (`#access_token=...`). O boot consome o token
 * ANTES de o roteador olhar para o hash — ver `consumeAuthFragment` em
 * `auth.svelte.ts` e a sequência em `App.svelte`. Como defesa em profundidade,
 * `parseRoute` cai na rota padrão diante de qualquer hash que não comece com `#/`,
 * então um fragmento de OAuth jamais vira uma rota inválida na tela.
 */

export const ROUTES = ['lista', 'converter', 'snapshot'] as const;
export type Route = (typeof ROUTES)[number];

export const DEFAULT_ROUTE: Route = 'lista';

export const ROUTE_LABELS: Readonly<Record<Route, string>> = Object.freeze({
  lista: 'Lista',
  converter: 'Converter escala',
  snapshot: 'Snapshot e diff',
});

export function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

/** `#/converter` → `'converter'`. Qualquer outra coisa → rota padrão. */
export function parseRoute(hash: string): Route {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!withoutHash.startsWith('/')) return DEFAULT_ROUTE;
  const [first = ''] = withoutHash.slice(1).split(/[/?]/);
  return isRoute(first) ? first : DEFAULT_ROUTE;
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}
