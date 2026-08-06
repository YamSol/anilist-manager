# CLAUDE.md

Instruções para agentes trabalhando neste repositório. Para o produto em si, leia o
[README](README.md); para o contrato, [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## O projeto

Gerenciador da lista de animes do AniList: client-side puro, sem backend, falando direto
com a API GraphQL pública. Monorepo npm com uma origem única em TypeScript
(`packages/core`) e uma interface Svelte 5 + Vite 7 (`apps/web`), de onde saem o site
estático, o PWA e a imagem Docker.

Quatro escopos: **autenticação** sem segredo, **listar/organizar/filtrar**, **converter a
escala de prioridade** e **snapshot/diff** contra uma lista de referência.

## Comandos

```bash
npm run dev            # vite na 5173
npm run build          # core (tsc) + web (vite build) → apps/web/dist
npm test               # vitest: core em node, web em jsdom
npm run test:coverage   # com o threshold de 90% do core
npm run test:e2e       # playwright
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit + svelte-check
npm run verify         # lint + typecheck + test:coverage + build — rode antes de commitar
```

Nunca use `--no-verify`. O hook de pre-commit roda `eslint --fix` e `prettier --write`
nos arquivos staged; ele reformatar seu markdown é esperado, não é conflito.

## Regras invariantes

### `packages/core` é TypeScript puro (RNF-03)

Sem DOM, sem I/O, sem globais de ambiente. Tudo que vem de fora — `fetch`, o relógio
(`now`), o `sleep` — é **injetado** por parâmetro. É o que torna tempo e rede testáveis
de forma determinística e o que vai permitir reusar o core num CLI Node e num build
Capacitor sem tocar em nada.

Três mecanismos guardam essa regra, e eles existem para ser respeitados, não contornados:

1. **`no-restricted-globals` no `eslint.config.js`** proíbe `window`, `document`,
   `localStorage`, `sessionStorage`, `navigator`, `location`, `alert` e `fetch` em
   `packages/core/src/**`.
2. **O projeto vitest do core roda em `environment: 'node'`**, sem jsdom. Qualquer acesso
   a DOM que passe pelo linter estoura em tempo de teste.
3. **`no-restricted-imports`** bloqueia importar `svelte`, `vite`, `ag-grid-*` ou
   `@anilist-updater/web` de dentro do core.

Se uma função do core parece precisar de DOM, a dependência está invertida: quem chama
injeta.

### Nenhuma lógica de domínio em componente Svelte

Componentes fazem render, evento e estado de tela. Cálculo, transformação, validação,
parsing, ordenação e regra de negócio moram no core, com teste próprio em Node. Um
`.svelte` que precisa de teste de unidade para uma função interna está no lugar errado.

### A escala de prioridade

`1` é a prioridade **máxima**, `5` a mínima, `0` significa "sem prioridade" e ordena
sempre por último — nas duas direções. A conversão é `nova = 6 - antiga` para `1..5`,
com `0` intacto.

**A conversão não é idempotente.** Aplicar duas vezes não desfaz: re-inverte. Nenhum
código pode aplicá-la sem preview, sem backup exportado e sem a guarda de reaplicação
(RF-21, RF-23, RF-26). Cuidado ao mexer em qualquer coisa que escreva prioridade em lote.

### Nenhum segredo NOSSO, nunca

Não existe backend e não existe credencial da aplicação — nem no código, nem no build, nem
em arquivo versionado, nem em variável de ambiente, nem "só para testar". Client ID e
Client Secret são **do usuário**, do client que ele registrou, informados em runtime e
guardados só no `localStorage` dele (RNF-02, AD-06).

O login é **authorization code grant**, não implicit. Isso não é escolha, é medição: o
AniList responde `unsupported_grant_type` a `response_type=token`, e o endpoint de token
não manda CORS (`OPTIONS` → 404). Por isso a troca do código passa por um **proxy de mesma
origem** em `/oauth/token`, declarado em dois lugares que precisam continuar iguais:
`apps/web/vite.config.ts` (dev e preview) e `deploy/nginx.conf` (container). O core conhece
o caminho como `TOKEN_PROXY_PATH`.

Antes de "simplificar" isso de volta para implicit grant, releia AD-10 no REQUIREMENTS: já
foi tentado, e não funciona.

### `docs/REQUIREMENTS.md` §5 é contrato congelado

A superfície pública de `packages/core` está congelada ali porque frentes paralelas
programam contra ela. Alterar assinatura, tipo ou semântica exige **atualizar o documento
antes do código**, não depois. O mesmo vale para qualquer requisito: a implementação
referencia um `RF-xx`/`RNF-xx`, e todo requisito é comprovado por pelo menos um teste.

## Convenções

- **pt-BR** em UI, mensagens de erro, comentários, nomes de teste e commits (RNF-10).
  Identificadores de código seguem o inglês técnico usual.
- **Conventional Commits**: `feat(escopo):`, `fix(escopo):`, `docs(escopo):`,
  `ci(escopo):`, `test(escopo):`, `refactor(escopo):`.
- Corpo do commit com action lines quando houver raciocínio a preservar:
  `decision(escopo):`, `rejected(escopo):`, `constraint(escopo):`, `learned(escopo):`.
  Só o que carrega sinal — não narre o diff.
- **Teste no mesmo commit do código.** Um commit que adiciona comportamento sem o teste
  que o comprova está incompleto.
- Comentário explica _por quê_, não _o quê_. Se o código precisa de comentário para
  dizer o que faz, reescreva o código.
- TypeScript `strict`, sem `any` implícito. Um `@ts-expect-error` exige descrição
  escrita; `@ts-ignore` é proibido pelo linter (RNF-07).
