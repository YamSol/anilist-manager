/**
 * Contrato de transporte HTTP do core.
 *
 * Mora num módulo próprio porque tanto o cliente GraphQL quanto a troca de token
 * do OAuth precisam dele, e nenhum dos dois deve depender do outro. O core nunca
 * toca `globalThis.fetch` — quem chama injeta (RNF-03, AD-04).
 */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
