# Requisitos — AniList Manager

> Documento normativo. É o contrato comum entre as frentes de trabalho paralelas.
> Toda implementação referencia um `RF-xx`/`RNF-xx` daqui, e todo requisito é comprovado
> por pelo menos um teste automatizado.

**Versão:** 1.0 · **Status:** aprovado · **Última revisão:** 2026-08-06

---

## 1. Visão

O AniList Manager é um aplicativo **client-side, sem backend**, que lê e escreve na lista de
animes do usuário no [AniList](https://anilist.co) via API GraphQL pública.

O projeto nasceu como um script Flask de propósito único ("atualizar priority") e cresceu para
quatro escopos distintos. Esta versão reorganiza o código em torno de uma **origem única** —
uma biblioteca TypeScript pura (`@anilist-updater/core`) — a partir da qual saem todos os
formatos de distribuição.

### 1.1 Escopos do produto

| #   | Escopo                                                                      | Estado anterior                                  |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| A   | **Autenticação** sem servidor e sem segredo                                 | existia com backend e client secret              |
| B   | **Listar, organizar e filtrar** por tipo, prioridade, status, gênero, score | existia pela metade (só 4 campos)                |
| C   | **Converter a escala de prioridade** antiga para a nova                     | **não existia**                                  |
| D   | **Snapshot / diff** contra uma lista de referência                          | existia amarrado a um `out.json` em caminho fixo |

### 1.2 Fora de escopo (nesta versão)

- Suporte a **MANGA** (a API é a mesma, mas nenhuma tela contempla).
- Edição de qualquer campo além de `priority` (score, progresso, status, notas).
- Sincronização com MyAnimeList, Kitsu ou qualquer outro serviço.
- Múltiplas contas simultâneas.
- Qualquer servidor próprio, banco de dados ou persistência remota.

---

## 2. Glossário

| Termo                      | Definição                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Escala antiga**          | `5` = prioridade máxima … `1` = mínima. `0` = sem prioridade.                                                                     |
| **Escala nova**            | `1` = prioridade máxima … `5` = mínima. `0` = sem prioridade. É a escala convencional de rank e a vigente a partir desta versão.  |
| **Conversão**              | A operação `nova = 6 - antiga` aplicada às entradas com prioridade `1..5`. `0` permanece `0`.                                     |
| **Entrada / `AnimeEntry`** | Uma linha canônica da lista: um anime, com suas prioridades e metadados, deduplicado entre listas.                                |
| **Snapshot**               | Um JSON `[{id, name, priority}]` capturando prioridades num momento do tempo. O `out.json` legado é um snapshot na escala antiga. |
| **Plano de conversão**     | O resultado calculado (e ainda não aplicado) de uma conversão: o que muda, o que fica igual, o que é ignorado.                    |

---

## 3. Requisitos funcionais

### 3.1 Escopo A — Autenticação

| ID        | Requisito                                                                                                                                                                | Critério de aceitação                                                                                                                                       | Teste                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **RF-01** | O usuário informa o próprio **Client ID** do AniList na primeira execução, persistido localmente.                                                                        | Após informar e recarregar a página, o Client ID continua preenchido. O artefato buildado não contém nenhum Client ID embutido obrigatório.                 | `auth.test.ts`, E2E `setup.spec.ts`    |
| **RF-02** | O login usa **authorization code grant** (`response_type=code`). O usuário informa o Client ID e o Client Secret **do client dele**; nenhum segredo da aplicação existe. | `buildAuthorizeUrl` produz uma URL com `response_type=code` e sem `client_secret`. O secret só aparece no corpo da troca, nunca na URL.                     | `auth.test.ts`                         |
| **RF-03** | O code volta na **query** (`?code=…`) e é trocado por token através de um proxy de mesma origem; a query é apagada da barra de endereços.                                | Após o retorno do AniList, `location.search` está vazio, a troca foi feita contra `TOKEN_PROXY_PATH` (nunca `anilist.co` direto) e o token está no storage. | `auth.test.ts`, `App.test.ts`          |
| **RF-04** | O usuário pode, alternativamente, **colar um access token** manualmente.                                                                                                 | Colar um token válido autentica sem passar pelo redirect.                                                                                                   | `auth.test.ts`, E2E                    |
| **RF-05** | Token expirado ou rejeitado (HTTP 401) desloga e leva de volta à tela de login, com mensagem explicando o motivo.                                                        | Uma resposta 401 da API resulta em `AuthError` e em estado deslogado — nunca numa tela em branco.                                                           | `client.test.ts` (MSW), `auth.test.ts` |
| **RF-06** | O usuário pode sair, o que apaga token e dados em cache do dispositivo.                                                                                                  | Após sair, o storage não contém token. O Client ID **é preservado** (é configuração, não credencial).                                                       | `auth.test.ts`                         |
| **RF-07** | O app **descobre antes do redirect** se a hospedagem tem o proxy de troca, e só oferece o caminho que de fato funciona ali.                                              | A sonda roda sem consumir authorization code. Sem proxy, a tela nunca apresenta "Entrar com AniList" como caminho principal para depois falhar na volta.    | `auth.test.ts`, `AuthScreen.test.ts`   |
| **RF-08** | Sem proxy, o app **conduz** a troca: captura o `?code=` sozinho e entrega um comando pronto, sem o usuário copiar nada da barra de endereços nem abrir um terminal.      | Após o retorno, o snippet exibido já contém client id, secret, redirect uri e code. Colar a resposta de volta autentica.                                    | `auth.test.ts`, `AuthScreen.test.ts`   |
| **RF-09** | O `refresh_token` devolvido pelo AniList é **persistido** junto do access token e usado para renovar a sessão antes de deslogar, onde houver proxy.                      | Uma troca bem-sucedida guarda os dois. Com access token vencido e refresh presente, a renovação é tentada antes de cair no login.                           | `auth.test.ts`                         |

### 3.2 Escopo B — Listar, organizar e filtrar

| ID        | Requisito                                                                                                                                              | Critério de aceitação                                                                                              | Teste                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **RF-10** | Carregar a coleção completa de animes do usuário e exibir como **uma linha por anime**, mesmo que ele esteja em várias listas.                         | Um anime presente em 3 listas gera 1 linha, com as 3 listas agregadas no campo `lists`.                            | `model.test.ts`                               |
| **RF-11** | Cada entrada carrega: título, prioridade, listas, `format`, `status`, `genres`, `averageScore`, `episodes`, `progress`, `season`, `seasonYear` e capa. | A `LIST_QUERY` pede todos esses campos e `normalizeCollection` os mapeia, com `null` onde a API omitir.            | `model.test.ts`                               |
| **RF-12** | O título exibido segue a precedência **english → romaji → native**, sem nunca ficar vazio.                                                             | Uma entrada com `english: null` cai para `romaji`; com ambos nulos, cai para `native`.                             | `model.test.ts`                               |
| **RF-13** | **Filtro facetado** por formato, status, prioridade, gênero, lista e faixa de score, combináveis (AND entre facetas, OR dentro de uma faceta).         | Filtrar `format=TV` + `priority=1` retorna só entradas que satisfazem os dois.                                     | `filter.test.ts`, componente `FilterBar`      |
| **RF-14** | **Busca textual** por título, sem diferenciar maiúsculas nem acentos.                                                                                  | Buscar "frieren" encontra "Frieren: Beyond Journey's End"; buscar "jujutsu" encontra "Jujutsu Kaisen".             | `filter.test.ts`                              |
| **RF-15** | As facetas exibem a **contagem** de entradas em cada opção.                                                                                            | `computeFacets` retorna, para cada valor, quantas entradas o possuem.                                              | `filter.test.ts`                              |
| **RF-16** | O estado dos filtros **persiste** entre sessões.                                                                                                       | Aplicar filtros, recarregar, e eles continuam ativos.                                                              | componente `FilterBar`                        |
| **RF-17** | Ordenação por qualquer coluna. Na coluna de prioridade, `1` vem primeiro e `0` (sem prioridade) vai **sempre para o fim**, em ambas as direções.       | `comparePriority` coloca `0` por último tanto em asc quanto em desc.                                               | `priority.test.ts`                            |
| **RF-18** | Alterar a prioridade de uma entrada direto na lista, com retorno visual de progresso, sucesso e erro.                                                  | O clique dispara a mutation; a célula mostra estado pendente, depois ✓ ou ✗; um erro não corrompe o valor exibido. | componente `PriorityPicker`, `client.test.ts` |

### 3.3 Escopo C — Conversão de escala

| ID        | Requisito                                                                                                                                               | Critério de aceitação                                                                                                             | Teste                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **RF-20** | A conversão é `nova = 6 - antiga` para `1..5`; `0` permanece `0`.                                                                                       | `invertPriority`: 5→1, 4→2, 3→3, 2→4, 1→5, 0→0.                                                                                   | `priority.test.ts`                                 |
| **RF-21** | O usuário vê um **preview antes/depois** de tudo que será alterado, **antes** de qualquer escrita.                                                      | Abrir a tela de conversão não emite nenhuma mutation. O preview lista cada mudança com valor de origem e destino.                 | `priority.test.ts`, componente `ConversionPreview` |
| **RF-22** | O plano separa três grupos: **alteradas** (`from ≠ to`), **inalteradas** (`from = to = 3`) e **ignoradas** (`priority = 0`), com contagem de cada.      | Uma lista com prioridades `[5,3,0]` produz 1 alterada, 1 inalterada, 1 ignorada.                                                  | `priority.test.ts`                                 |
| **RF-23** | **Exportar backup JSON** do estado atual antes de aplicar. É o único caminho de desfazer.                                                               | O botão de aplicar fica indisponível até que o backup tenha sido exportado nesta sessão.                                          | componente `ConversionPreview`, E2E                |
| **RF-24** | Aplicar em lote, com **barra de progresso** e possibilidade de **cancelar** no meio.                                                                    | Cancelar interrompe o lote; o resultado informa quantas foram aplicadas e que houve aborto. As já aplicadas permanecem aplicadas. | `bulk.test.ts` (MSW)                               |
| **RF-25** | Falha individual **não aborta o lote**: as demais seguem, e no fim é apresentada a lista de falhas.                                                     | Com a 2ª de 5 mutations falhando, 4 são aplicadas e 1 aparece em `failed`.                                                        | `bulk.test.ts` (MSW)                               |
| **RF-26** | **Guarda de idempotência**: aplicar a conversão duas vezes desfaz a primeira. O app registra quando converteu e exibe aviso exigindo confirmação extra. | Com registro de conversão anterior presente, a tela mostra o aviso e o botão de aplicar exige uma segunda confirmação.            | componente `ConversionPreview`                     |

### 3.4 Escopo D — Snapshot e diff

| ID        | Requisito                                                                                                       | Critério de aceitação                                                                                                                  | Teste              |
| --------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **RF-30** | **Importar** um snapshot `[{id, name, priority}]` por seletor de arquivo. O `out.json` legado é entrada válida. | Importar o `out.json` de 37 entradas produz 37 itens válidos.                                                                          | `snapshot.test.ts` |
| **RF-31** | Um snapshot malformado produz **erro legível**, nunca um crash.                                                 | JSON inválido, raiz que não é array, item sem `id`, ou `priority` fora de `0..5` geram `SnapshotParseError` com a posição do problema. | `snapshot.test.ts` |
| **RF-32** | **Exportar** o estado vivo no mesmo formato.                                                                    | O JSON exportado é reimportável sem perda.                                                                                             | `snapshot.test.ts` |
| **RF-33** | **Diff** entre snapshot e lista viva, marcando cada linha como igual, divergente ou ausente da conta.           | O resumo traz as contagens de `matched`, `mismatched` e `missing`.                                                                     | `snapshot.test.ts` |
| **RF-34** | Opção **"este snapshot está na escala antiga"**, que inverte os valores do snapshot na comparação.              | Um snapshot pré-conversão, comparado com a flag ligada a uma lista já convertida, resulta em zero divergências.                        | `snapshot.test.ts` |
| **RF-35** | Listar as entradas **sem prioridade** (`0`) da conta, como pendências.                                          | O relatório traz a contagem e os títulos das entradas com `priority = 0`.                                                              | `snapshot.test.ts` |

---

## 4. Requisitos não-funcionais

| ID         | Requisito                                                                                                                                                                                                                                                                                     | Como é verificado                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RNF-01** | **Sem backend.** Nenhum servidor próprio no caminho crítico; o app fala direto com `graphql.anilist.co`.                                                                                                                                                                                      | Nenhuma dependência de servidor no build; o Docker serve arquivos estáticos com nginx.                                                             |
| **RNF-02** | **Sem segredo nosso.** Nenhuma credencial da aplicação no código, no build ou em arquivo versionado. O Client Secret que o app manipula é **do usuário**, do client que ele registrou: fica só no `localStorage` dele, some no logout, e nunca vai para lugar nenhum além do próprio AniList. | Nenhum valor literal de secret no repo; o artefato buildado não embute credencial alguma. Ver AD-10 para por que o secret passou a ser necessário. |
| **RNF-03** | **`packages/core` não toca em DOM.** Sem `window`, `document`, `localStorage` ou `fetch` global. Dependências externas são injetadas.                                                                                                                                                         | Teste em Node puro (sem jsdom) que importa e exercita o core.                                                                                      |
| **RNF-04** | **Rate limit respeitado**: no máximo 90 requisições/minuto, com backoff obedecendo o header `Retry-After` em respostas 429.                                                                                                                                                                   | `client.test.ts` com MSW devolvendo 429 + `Retry-After`.                                                                                           |
| **RNF-05** | **PWA instalável e offline-capable na casca.** Nenhum recurso vindo de CDN em runtime.                                                                                                                                                                                                        | Manifest + service worker presentes; auditoria de instalabilidade; grep por `cdn.jsdelivr` retorna vazio.                                          |
| **RNF-06** | **Bundle inicial < 500 KB gzip.**                                                                                                                                                                                                                                                             | Relatório de tamanho do `vite build` verificado no CI.                                                                                             |
| **RNF-07** | **TypeScript `strict`**, sem `any` implícito e sem `@ts-ignore` sem justificativa escrita.                                                                                                                                                                                                    | `tsc --noEmit` e ESLint no CI.                                                                                                                     |
| **RNF-08** | **Cobertura de `packages/core` ≥ 90% de linhas**, travada por threshold — abaixo disso o build falha.                                                                                                                                                                                         | `vitest --coverage` no CI.                                                                                                                         |
| **RNF-09** | **Acessível por teclado**: navegar e alterar prioridade sem mouse; foco visível.                                                                                                                                                                                                              | Teste de componente com navegação por teclado.                                                                                                     |
| **RNF-10** | **Idioma pt-BR** em UI, mensagens de erro, comentários e commits.                                                                                                                                                                                                                             | Revisão.                                                                                                                                           |
| **RNF-11** | **Nenhum dado do usuário sai do dispositivo** além das chamadas à própria API do AniList. Sem telemetria, sem analytics.                                                                                                                                                                      | Revisão de dependências e de chamadas de rede.                                                                                                     |

---

## 5. Contrato público de `packages/core`

Congelado aqui. As frentes `feat/core` e `feat/web-ui` programam contra este contrato em
paralelo. Alterá-lo exige atualizar este documento **primeiro**.

### 5.1 `model.ts`

```ts
export type Priority = 0 | 1 | 2 | 3 | 4 | 5;
export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
export type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';
export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AnimeEntry {
  readonly id: number; // mediaId no AniList
  readonly title: string; // english → romaji → native (RF-12)
  readonly priority: Priority;
  readonly lists: readonly string[]; // nomes das listas que contêm o anime
  readonly status: ListStatus | null;
  readonly format: MediaFormat | null;
  readonly genres: readonly string[];
  readonly averageScore: number | null; // 0..100
  readonly episodes: number | null;
  readonly progress: number;
  readonly season: MediaSeason | null;
  readonly seasonYear: number | null;
  readonly coverImage: string | null;
}

/** Domínios fechados, na ordem canônica de exibição. Populam os selects da UI. */
export const ALL_MEDIA_FORMATS: readonly MediaFormat[];
export const ALL_LIST_STATUSES: readonly ListStatus[];
export const ALL_MEDIA_SEASONS: readonly MediaSeason[];

/**
 * Dedupe por mediaId, agregando nomes de lista. RF-10, RF-11.
 *
 * Aceita as três formas do payload: resposta completa (`{data:{MediaListCollection}}`),
 * o `data` desembrulhado (`{MediaListCollection}`) e a coleção crua (`{lists}`).
 * **Nunca lança** — entrada inválida devolve `[]`.
 */
export function normalizeCollection(raw: unknown): AnimeEntry[];

/**
 * RF-12. Lança se os três títulos forem nulos — mas `normalizeCollection` não
 * perde a linha por isso: ela cai para o rótulo `#<mediaId>`.
 */
export function pickTitle(t: {
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
}): string;
```

### 5.2 `priority.ts`

```ts
export const PRIORITY_UNSET = 0;
export const PRIORITY_HIGHEST = 1;
export const PRIORITY_LOWEST = 5;

/** Índice = prioridade. Posição 0 = "sem prioridade". 1 é a cor mais quente. */
export const PRIORITY_COLORS: Readonly<Record<Priority, string>>;
export const PRIORITY_LABELS: Readonly<Record<Priority, string>>;

export const ALL_PRIORITIES: readonly Priority[];

export function isPriority(value: unknown): value is Priority;

/** RF-20. nova = 6 - antiga para 1..5; 0 → 0. */
export function invertPriority(p: Priority): Priority;

/** RF-17. Ascendente por urgência: 1 primeiro, 0 por último. */
export function comparePriority(a: Priority, b: Priority): number;

/**
 * RF-17. Descendente: 5 primeiro, **0 continua por último**.
 *
 * Existe porque `-comparePriority(a, b)` NÃO resolve — negar leva o 0 para o topo
 * e viola RF-17. Toda ordenação decrescente de prioridade deve usar esta função.
 */
export function comparePriorityDesc(a: Priority, b: Priority): number;
```

> ⚠️ **Ordenadores que negam o comparador** (ag-grid e a maioria dos grids) não podem
> usar `comparePriorityDesc`: eles recebem **um só** comparador e invertem o sinal do
> retorno por conta própria, o que jogaria o `0` para o topo. Nesse caso, passe
> `comparePriority` e desfaça a negação **apenas nos pares que envolvem `0`` — ver
`apps/web/src/lib/grid.ts`. `comparePriorityDesc` serve para ordenadores que aceitam
um comparador por direção (`Array.prototype.sort` direto, por exemplo).

```ts
export interface ConversionChange {
  readonly id: number;
  readonly title: string;
  readonly from: Priority;
  readonly to: Priority;
}

export interface ConversionPlan {
  readonly changes: readonly ConversionChange[]; // from !== to
  readonly unchanged: readonly ConversionChange[]; // from === to, exceto 0
  readonly skipped: readonly AnimeEntry[]; // priority === 0
  readonly total: number; // entradas consideradas
}

/** RF-21, RF-22. Puro: não escreve nada. */
export function planConversion(entries: readonly AnimeEntry[]): ConversionPlan;
```

### 5.3 `errors.ts`

```ts
export class AniListError extends Error {}
export class AuthError extends AniListError {} // RF-05
export class RateLimitError extends AniListError {
  readonly retryAfterMs: number;
} // RNF-04
export class NetworkError extends AniListError {}
export class GraphQLError extends AniListError {
  readonly errors: readonly { readonly message: string }[];
}
export class SnapshotParseError extends AniListError {
  readonly at: string;
} // RF-31
```

### 5.4 `auth.ts`

```ts
export interface AuthConfig {
  readonly clientId: string;
  readonly redirectUri: string;
}

/** Usado quando a resposta de token vem sem `expires_in`. 1 hora, conservador. */
export const DEFAULT_TOKEN_TTL_MS: number;

/** Validade documentada dos tokens do AniList: 1 ano. */
export const ANILIST_TOKEN_TTL_MS: number;

/** Caminho de mesma origem onde o proxy de troca de token é esperado (AD-10). */
export const TOKEN_PROXY_PATH: string;

/**
 * RF-02. `response_type=code` — o AniList NÃO habilita implicit grant (AD-10).
 * O secret não entra nesta URL; ele só aparece na troca do código.
 * Lança `AniListError` se `clientId` ou `redirectUri` estiverem em branco — não
 * chame a cada tecla digitada sem `try`.
 */
export function buildAuthorizeUrl(config: AuthConfig): string;

export interface StoredToken {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresAt: number; // epoch ms
  /**
   * RF-09. Só existe quando veio de uma troca; um token colado à mão não tem
   * como produzi-lo. Quando ausente, a CHAVE não existe — não vale `undefined`.
   */
  readonly refreshToken?: string;
}

export interface AuthCallback {
  readonly code: string | null;
  readonly error: string | null;
  readonly errorDescription: string | null;
}

/**
 * RF-03. Lê `?code=…` ou `?error=…` da QUERY do redirect de volta.
 * Retorna `null` quando a query não é de um retorno de autorização.
 */
export function parseAuthCallback(search: string): AuthCallback | null;

export interface ExchangeCodeOptions {
  readonly code: string;
  readonly clientId: string;
  /** Secret do client DO USUÁRIO. Ver RNF-02. */
  readonly clientSecret: string;
  readonly redirectUri: string;
  /** Default: `TOKEN_PROXY_PATH`. Sempre mesma origem, nunca `anilist.co`. */
  readonly tokenEndpoint?: string;
  readonly fetcher?: Fetcher;
  readonly now?: () => number;
}

/**
 * RF-03. Troca o authorization code por um access token, via proxy (AD-10).
 *
 * Lança `TokenExchangeUnavailableError` quando não há proxy — inclusive no caso
 * traiçoeiro de HTTP 200 com HTML, que é o SPA fallback de um host estático;
 * `AuthError` quando o AniList recusa credencial ou code; `NetworkError` no resto.
 */
export function exchangeCodeForToken(options: ExchangeCodeOptions): Promise<StoredToken>;

export interface RefreshTokenOptions {
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenEndpoint?: string; // default: TOKEN_PROXY_PATH
  readonly fetcher?: Fetcher;
  readonly now?: () => number;
}

/**
 * RF-09. Troca o refresh token por um access token novo, pelo mesmo proxy.
 *
 * ⚠️ NÃO VERIFICADO contra a API real: exige um refresh token válido, que só um
 * login real produz. O grant existe no league/oauth2-server, mas o implicit já
 * ensinou que "a biblioteca suporta" não implica "está habilitado" (AD-05).
 * Quem chama trata a falha como caminho normal e cai no login.
 */
export function refreshAccessToken(options: RefreshTokenOptions): Promise<StoredToken>;

export interface ProbeTokenProxyOptions {
  readonly tokenEndpoint?: string; // default: TOKEN_PROXY_PATH
  readonly fetcher?: Fetcher;
}

/**
 * RF-07. Responde se esta hospedagem tem o proxy de troca, ANTES do redirect.
 *
 * Posta um `{}` sem grant_type: o AniList recusa, e é a *forma* da resposta que
 * responde a pergunta. Sem credencial e sem code no corpo, não consome nada.
 * Nunca lança — falha de rede devolve `false`, porque quem chama precisa
 * escolher uma tela, não tratar exceção.
 */
export function probeTokenProxy(options?: ProbeTokenProxyOptions): Promise<boolean>;

/**
 * RF-04. Constrói um `StoredToken` a partir de um token colado à mão.
 * A política de expiração do token colado é decidida aqui, uma vez, e não
 * reinventada por cada cliente (web, CLI, APK). Lança se o token vier em branco.
 */
export function tokenFromAccessToken(accessToken: string, now: number, ttlMs?: number): StoredToken;

export interface TokenExchangeSnippetOptions {
  readonly code: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

/**
 * RF-08, AD-11. Monta o comando que o usuário roda no console COM O ANILIST
 * ABERTO NA ABA, onde a troca é mesma origem e o CORS não se aplica.
 *
 * O corpo é embutido como literal produzido por `JSON.stringify` — JSON é
 * subconjunto de JS, então o escape de valores hostis sai correto de graça.
 * O snippet imprime E copia o resultado: o authorization code é de uso único.
 */
export function buildTokenExchangeSnippet(options: TokenExchangeSnippetOptions): string;

/**
 * RF-08. Aceita o que o usuário colar: a resposta INTEIRA do token endpoint, ou
 * só o access token cru. Onde não há proxy é ele quem faz a troca (AD-11), e
 * exigir que garimpe o `access_token` de um objeto com dois valores longos e
 * parecidos é convidar a colar o `refresh_token` por engano.
 *
 * Lança `AuthError` quando o JSON colado é uma recusa do AniList, `AniListError`
 * quando não é uma resposta de token.
 */
export function parseTokenResponse(input: string, now: number): StoredToken;

export function isTokenExpired(token: StoredToken, now: number): boolean;

/** Implementado pela camada de UI sobre localStorage. */
export interface TokenStore {
  load(): StoredToken | null;
  save(token: StoredToken): void;
  clear(): void;
}
```

### 5.5 `client.ts`

```ts
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface AniListClientOptions {
  readonly token: string;
  readonly fetcher?: Fetcher; // default: globalThis.fetch
  readonly endpoint?: string; // default: https://graphql.anilist.co
  readonly requestsPerMinute?: number; // default: 90 (RNF-04)
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly maxRetries?: number; // default: 3
}

export class AniListClient {
  constructor(options: AniListClientOptions);
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  getViewerId(): Promise<number>;
  getAnimeList(userId: number): Promise<AnimeEntry[]>;
  setPriority(mediaId: number, priority: Priority): Promise<void>;
}
```

### 5.6 `filter.ts`

```ts
export interface FilterState {
  readonly text: string;
  readonly formats: readonly MediaFormat[];
  readonly statuses: readonly ListStatus[];
  readonly priorities: readonly Priority[];
  readonly genres: readonly string[];
  readonly lists: readonly string[];
  readonly minScore: number | null;
  readonly maxScore: number | null;
}

export const EMPTY_FILTER: FilterState;

export function matchesFilter(entry: AnimeEntry, filter: FilterState): boolean; // RF-13
export function applyFilter(entries: readonly AnimeEntry[], filter: FilterState): AnimeEntry[];

export interface FacetCount<T> {
  readonly value: T;
  readonly count: number;
}

export interface Facets {
  readonly formats: readonly FacetCount<MediaFormat>[];
  readonly statuses: readonly FacetCount<ListStatus>[];
  readonly priorities: readonly FacetCount<Priority>[];
  readonly genres: readonly FacetCount<string>[];
  readonly lists: readonly FacetCount<string>[];
}

export function computeFacets(entries: readonly AnimeEntry[]): Facets; // RF-15

/** RF-14. Case- e accent-insensitive. */
export function normalizeText(value: string): string;
```

### 5.7 `bulk.ts`

```ts
export interface BulkFailure {
  readonly change: ConversionChange;
  readonly error: AniListError;
}

export interface BulkProgress {
  readonly done: number;
  readonly total: number;
  readonly current: ConversionChange | null;
  readonly failed: readonly BulkFailure[];
}

export interface BulkResult {
  readonly applied: readonly ConversionChange[];
  readonly failed: readonly BulkFailure[];
  readonly aborted: boolean;
}

export interface ApplyOptions {
  readonly signal?: AbortSignal; // RF-24
  readonly onProgress?: (progress: BulkProgress) => void;
}

/** RF-24, RF-25. Uma falha individual não aborta o lote. */
export function applyPlan(
  client: AniListClient,
  plan: ConversionPlan,
  options?: ApplyOptions,
): Promise<BulkResult>;
```

### 5.8 `snapshot.ts`

```ts
export interface SnapshotItem {
  readonly id: number;
  readonly name: string;
  readonly priority: Priority;
}

export type Snapshot = readonly SnapshotItem[];

/** RF-30, RF-31. Lança SnapshotParseError com a posição do item inválido. */
export function parseSnapshot(json: unknown): Snapshot;

export function toSnapshot(entries: readonly AnimeEntry[]): Snapshot; // RF-32

/**
 * RF-35. As pendências da conta: entradas com prioridade 0.
 * Independe de snapshot — exigir um arquivo importado para chegar nessa lista
 * acoplaria dois escopos diferentes. `SnapshotDiff.unset` reusa esta função.
 */
export function unsetEntries(entries: readonly AnimeEntry[]): AnimeEntry[];

export interface DiffRow {
  readonly id: number;
  readonly name: string;
  readonly expected: Priority;
  readonly actual: Priority | null; // null = ausente da conta
  readonly ok: boolean;
}

export interface SnapshotDiff {
  readonly rows: readonly DiffRow[];
  readonly matched: number;
  readonly mismatched: number;
  readonly missing: number;
  readonly unset: readonly AnimeEntry[]; // RF-35
}

export interface DiffOptions {
  /** RF-34. Inverte os valores do snapshot antes de comparar. */
  readonly legacyScale?: boolean;
}

export function diffSnapshot(
  snapshot: Snapshot,
  entries: readonly AnimeEntry[],
  options?: DiffOptions,
): SnapshotDiff; // RF-33
```

### 5.9 Comportamentos garantidos

Contratos que não aparecem nas assinaturas mas que a UI pode assumir:

| Área                       | Garantia                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AniListClient.request`    | Devolve `payload.data`, já desembrulhado.                                                                                                                                                                         |
| `AniListClient`            | **401 e 403 viram `AuthError` sem retry.** `maxRetries` conta _retentativas_ — 3 significa 4 idas à rede no pior caso.                                                                                            |
| `normalizeCollection`      | Nunca lança. Entrada irreconhecível vira `[]`. Anime sem título nos três idiomas recebe o rótulo `#<mediaId>`.                                                                                                    |
| `parseSnapshot`            | Aceita tanto o objeto já parseado quanto **a string crua do arquivo**. JSON inválido lança `SnapshotParseError` com `at: '$'`. Caminhos seguem o formato `$[3].priority`.                                         |
| `diffSnapshot`             | Só o snapshot gera linhas em `rows`, e `name` vem do snapshot, não do título vivo. Anime que existe só na conta aparece em `unset` (RF-35), nunca em `rows`.                                                      |
| `applyPlan` / `onProgress` | Emitido **antes** de cada escrita (com `current` preenchido) e uma última vez ao terminar (`current: null`, `done === total`). A falha de uma escrita só aparece no evento seguinte. `failed` é sempre uma cópia. |

---

## 6. Decisões de arquitetura

| #         | Decisão                                                                                 | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AD-01** | **Eliminar o backend.**                                                                 | A API do AniList envia `Access-Control-Allow-Origin: *` e suporta implicit grant. Sem backend, o mesmo build vira site estático, PWA, container e (depois) APK — que é literalmente o pedido de "origem única convertida para modos de distribuição".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **AD-02** | **TypeScript, não Python.**                                                             | Um core em Python inviabilizaria APK e HTML de arquivo único sem embarcar um interpretador. TS roda em todos os alvos pretendidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **AD-03** | **Dois pacotes (`core` + `apps/web`), não três.**                                       | Capacitor e o build single-file reempacotam o _output_ de `apps/web`, não componentes soltos. Um `packages/ui` separado seria cerimônia sem consumidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **AD-04** | **`core` sem DOM, com dependências injetadas** (`fetcher`, `now`, `sleep`).             | É o que permite testar tempo e rede de forma determinística, e o que habilita um CLI Node reusando a mesma lógica.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **AD-05** | ~~**Implicit grant, não o fluxo PIN do AniList.**~~ **REVOGADA** — ver AD-10.           | A premissa era falsa: o AniList **não habilita implicit grant**. Verificado contra a API real em 2026-08-06, `response_type=token` devolve `{"error":"unsupported_grant_type"}`. Mantida aqui porque explica o desenho original de várias partes do código.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **AD-06** | **Client ID informado pelo usuário em runtime**, não embutido no build.                 | Torna o artefato distribuível genérico: qualquer pessoa usa o mesmo `dist/` ou a mesma imagem Docker com as credenciais dela.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **AD-07** | **Snapshot por seletor de arquivo**, não caminho fixo.                                  | Um app de browser não tem acesso a `./out.json`. Generalizar para import/export cobre o caso legado e mais casos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **AD-08** | **Manter o ag-grid**, agora como dependência npm em vez de CDN.                         | A UX de sort/filtro já era boa e é conhecida do usuário; virar dependência npm é o que permite funcionar offline (RNF-05).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **AD-09** | **Conversão com preview obrigatório e backup antes de aplicar.**                        | A operação é destrutiva e quase irreversível: reaplicar não desfaz, _re-inverte_. O backup JSON é o único caminho de volta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **AD-10** | **Authorization code grant, com a troca passando por um proxy de mesma origem.**        | Substitui a AD-05. Duas medições contra a API real fecham as alternativas: (1) `response_type=token` → `unsupported_grant_type`, então implicit está desligado; (2) `OPTIONS /api/v2/oauth/token` → 404 e o POST volta sem `Access-Control-Allow-Origin`, então o browser não troca o code sozinho. O proxy (`vite.config.ts` em dev, `deploy/nginx.conf` em produção) resolve nos dois alvos do primeiro corte. Em host estático puro não há proxy, e a UI cai para colar o token (RF-04) — por isso `TokenExchangeUnavailableError` é um tipo próprio, e não `AuthError`: distinguir limitação de ambiente de credencial errada é o que decide qual tela mostrar.                                                                                       |
| **AD-11** | **Onde não há proxy, a troca acontece no console do navegador aberto em `anilist.co`.** | A limitação da AD-10 é de _origem_, não de capacidade: o browser sabe fazer a requisição; o que falta é uma origem autorizada a falar com `/api/v2/oauth/token`. Numa aba em `anilist.co` essa origem existe, e o CORS deixa de ser questão. Então o app não manda ninguém para o terminal: ele monta o snippet já preenchido com client id, secret, redirect uri e o code que ele mesmo capturou, e aceita a resposta colada de volta inteira. Trocar `curl` por console elimina o escape de aspas, funciona igual nos três sistemas operacionais e mantém o secret dentro do navegador do usuário (RNF-02, RNF-11). Custo aceito: navegador de celular não tem console utilizável, e ali o caminho continua sendo colar um token obtido de outro jeito. |

---

## 7. Backlog

Fora desta versão, viabilizados pela arquitetura escolhida:

- **APK Android** via Capacitor, reempacotando o mesmo `dist/`, com redirect por custom
  scheme (`anilistmgr://auth`) para preservar o implicit grant.
- **HTML de arquivo único** via `vite-plugin-singlefile` — essencialmente um segundo config.
- **CLI Node** consumindo `packages/core` direto, para automação em lote e cron.
- **Suporte a MANGA** (`MediaListCollection(type: MANGA)`).
- **Desktop nativo** via Tauri.
- Edição de outros campos além de `priority`.
