# AniList Manager

Gerenciador da sua lista de animes do [AniList](https://anilist.co). Roda inteiro no
navegador, sem backend: fala direto com a API GraphQL pública e não guarda nada fora do
seu dispositivo.

Uma origem única em TypeScript (`packages/core`) alimenta todos os formatos de
distribuição — site estático, PWA instalável e container Docker.

> **Nota:** o projeto foi reescrito na v2. Se você usava a versão em Python/Flask, leia
> [Migrando da v1](#migrando-da-v1) antes.

---

## O que ele faz

| Escopo                          | O que é                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Autenticação**                | Login no AniList sem servidor e sem segredo, ou colando um access token na mão.                                                               |
| **Listar, organizar e filtrar** | Uma linha por anime (mesmo que ele esteja em várias listas), com filtro facetado por formato, status, prioridade, gênero, lista e score.      |
| **Converter a escala**          | Migração da escala antiga de prioridade para a nova, com preview e backup obrigatórios.                                                       |
| **Snapshot / diff**             | Importar uma lista de referência `[{id, name, priority}]`, comparar com a conta viva e ver o que divergiu, o que sumiu e o que está sem nota. |

O contrato completo — cada requisito e o teste que o comprova — está em
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

---

## A conversão de escala

Esse é o motivo principal da v2, e é a operação mais perigosa do app.

|         | Escala antiga     | Escala nova (a partir da v2) |
| ------- | ----------------- | ---------------------------- |
| **1**   | prioridade mínima | **prioridade máxima**        |
| **5**   | prioridade máxima | prioridade mínima            |
| **0**   | sem prioridade    | sem prioridade               |
| Fórmula | —                 | `nova = 6 - antiga`          |

A escala nova é a convenção de rank de todo mundo: "prioridade 1" é o que você quer ver
primeiro. A conversão inverte os valores `1..5` e deixa o `0` intacto.

**É uma migração de mão única.** A operação não é idempotente: aplicar duas vezes não
desfaz nada, apenas re-inverte tudo de volta. Por isso a tela de conversão impõe:

1. **Preview obrigatório.** Abrir a tela não escreve nada. Você vê antes/depois de cada
   entrada, separadas em alteradas, inalteradas (o `3`, que é ponto fixo) e ignoradas
   (as `0`).
2. **Backup obrigatório.** O botão de aplicar só destrava depois de exportar o JSON do
   estado atual. Esse arquivo é o único caminho de volta.
3. **Aviso de reaplicação.** Se o app já registrou uma conversão nesta conta, ele exige
   uma confirmação extra.

A aplicação é em lote, com barra de progresso e botão de cancelar. Uma falha individual
não aborta o resto — no fim você recebe a lista do que não passou.

---

## Setup de desenvolvimento

Requer **Node >= 20.19** (a série 22 é a usada no CI e na imagem Docker).

```bash
npm install
npm run dev
```

O Vite sobe em <http://localhost:5173>.

### Scripts

| Script                  | O que faz                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento com HMR, na porta 5173.                  |
| `npm run build`         | Compila o core e gera `apps/web/dist/`, servido na raiz.             |
| `npm run build:pages`   | Idem, mas com o prefixo de subcaminho do GitHub Pages.               |
| `npm run preview`       | Serve o `dist/` já buildado na porta 3000.                           |
| `npm test`              | Testes unitários e de componente (vitest).                           |
| `npm run test:watch`    | Idem, em modo watch.                                                 |
| `npm run test:coverage` | Testes com cobertura e o threshold de 90% do core.                   |
| `npm run test:e2e`      | Testes de ponta a ponta (playwright).                                |
| `npm run lint`          | ESLint em todo o repositório.                                        |
| `npm run lint:fix`      | ESLint com `--fix`.                                                  |
| `npm run format`        | Prettier em todo o repositório.                                      |
| `npm run typecheck`     | `tsc --noEmit` no core e `svelte-check` na web.                      |
| `npm run verify`        | `lint` + `typecheck` + `test:coverage` + `build`. É o que o CI roda. |

---

## Obtendo as credenciais

O app não vem com credenciais embutidas: **cada pessoa registra o client dela**, informa
na primeira execução e tudo fica guardado só no navegador. É isso que permite distribuir o
mesmo `dist/` e a mesma imagem Docker para qualquer um.

1. Entre em <https://anilist.co/settings/developer> e crie uma nova aplicação.
2. Em **Redirect URI**, coloque a origem exata onde o app roda:

   | Onde você roda     | Redirect URI                          |
   | ------------------ | ------------------------------------- |
   | `npm run dev`      | `http://localhost:5173`               |
   | Docker / `preview` | `http://localhost:3000`               |
   | Hospedado          | a URL pública, ex. `https://seu.site` |

   Sem barra no fim e sem caminho — é a origem, não uma rota. Se você usa mais de um
   ambiente, cadastre uma aplicação para cada um (o AniList aceita só um Redirect URI
   por aplicação).

3. Copie o **Client ID** e o **Client Secret** e cole na tela de configuração do app.

### Por que o Client Secret é necessário

A intenção original era usar _implicit grant_, que dispensaria o secret. **Não funciona:**
o AniList não habilita esse fluxo — `response_type=token` responde
`{"error":"unsupported_grant_type"}`. E o endpoint de troca de token não manda CORS
(`OPTIONS` responde 404), então o navegador também não consegue trocar o código sozinho.

O desenho atual contorna as duas coisas: o login é _authorization code grant_, e a troca do
código passa por um **proxy de mesma origem** que o servidor de desenvolvimento e o
container já fornecem em `/oauth/token`.

O secret que você cola é **do seu próprio client**, não da aplicação:

- fica no `localStorage` do seu navegador e em nenhum outro lugar;
- é apagado quando você sai (o Client ID permanece, porque é configuração);
- só trafega da sua máquina para o AniList, pelo proxy — que não registra o corpo em log;
- não existe nenhum segredo versionado no repositório nem embutido no build.

Se ele vazar (num print, num log, numa conversa), regenere-o em
<https://anilist.co/settings/developer>: isso invalida os tokens emitidos com ele.

### Hospedagem estática, sem proxy

Num host que serve só arquivos (GitHub Pages, sr.ht pages) não há proxy. O app **descobre
isso ao abrir**, antes de você clicar em qualquer coisa, e avisa que o login vai ter um
passo a mais. Ele não some com o botão de entrar: o redirect continua sendo como o app
obtém o código.

O que muda é a volta. Em vez de dar erro, ele:

1. captura o `?code=` sozinho — você não copia nada da barra de endereços;
2. monta um comando **já preenchido** com client id, secret, redirect uri e o código;
3. pede que você o cole no console do navegador **com o `anilist.co` aberto na aba**;
4. aceita a resposta inteira colada de volta, do jeito que ela sai do console.

O console do `anilist.co` funciona onde a página do app não funciona porque ali a
requisição é **mesma origem** — a barreira nunca foi o navegador, foi a origem. Não é
preciso terminal, não há aspas para escapar, e o comportamento é o mesmo nos três sistemas.

Colar a resposta inteira também guarda o `refresh_token`, que extrair só o `access_token`
jogaria fora. O access token vale um ano.

> Navegador de celular não tem console utilizável. Sem proxy e sem desktop, o caminho
> continua sendo colar um access token obtido de outro jeito.

### Deploy num subcaminho (GitHub Pages)

Um _project site_ (`https://usuario.github.io/repo/`) serve o app num subcaminho, e o
`dist/` padrão não vale ali: o `index.html` pediria os assets em `/assets/…` e tomaria 404.

**Não edite o `base` no `vite.config.ts`** — isso quebra dev, `preview` e o container, e
volta como conflito a cada `git pull`. O prefixo é propriedade de um alvo de deploy, e entra
por fora:

```bash
npm run build:pages  # lê apps/web/.env.pages
```

`build:pages` aplica o prefixo também ao `scope`/`start_url` do PWA e ao fallback de
navegação do service worker. Para outro subcaminho, mude `apps/web/.env.pages` ou exporte
`BASE_PATH`.

O deploy é automático: `.github/workflows/pages.yml` roda `build:pages` a cada push em
`master` e publica em <https://yamsol.github.io/anilist-manager/>. Rodar o build na mão só
faz sentido para conferir o resultado antes de empurrar.

---

## Rodando com Docker

A imagem é um nginx servindo o `dist/` estático — nenhum backend, nenhuma variável de
ambiente, nenhum volume.

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Acesse <http://localhost:3000>. Para rodar em background use `-d`; para parar,
`docker compose -f deploy/docker-compose.yml down`.

Sem o compose:

```bash
docker build -f deploy/Dockerfile -t anilist-manager .
docker run --rm -p 3000:8080 anilist-manager
```

O container escuta na 8080 e roda como usuário não-root; a porta publicada no host
continua sendo a 3000, igual à v1. Lembre de cadastrar `http://localhost:3000` como
Redirect URI da sua aplicação no AniList.

---

## Instalando como PWA

O build gera manifest e service worker: a casca do app funciona offline (as chamadas à
API do AniList, não — dado de lista desatualizado é pior que um erro explícito). O app
se atualiza sozinho quando você recarrega com uma versão nova publicada.

Instalação requer **HTTPS**, com `localhost` como exceção.

- **Android / Chrome:** menu ⋮ → _Instalar aplicativo_ (ou _Adicionar à tela inicial_).
- **iOS / Safari:** botão de compartilhar → _Adicionar à Tela de Início_.
- **Desktop (Chrome, Edge, Brave):** ícone de instalar na barra de endereços, ou
  menu ⋮ → _Instalar_.
- **Firefox desktop:** não instala PWA; use como aba normal.

---

## Estrutura do repositório

```
packages/core/      lógica de domínio — a origem única
apps/web/           interface Svelte 5 + Vite 7
deploy/             Dockerfile, nginx.conf, compose e o gerador de ícones
docs/REQUIREMENTS.md contrato normativo do projeto
```

| Pacote          | Papel                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | TypeScript puro: modelo, prioridades, filtros, cliente GraphQL, snapshot/diff, lote. **Sem DOM e sem I/O** — `fetch`, relógio e `sleep` são injetados. É o que permite testar tempo e rede de forma determinística, e o que vai permitir reusar tudo num CLI. |
| `apps/web`      | Svelte 5 + Vite 7 + ag-grid. Componentes, estado e persistência em `localStorage`. Gera o `dist/` estático que vira site, PWA e container.                                                                                                                    |
| `deploy`        | Tudo que empacota o `dist/`. `gen-icons.mjs` regenera os PNGs do PWA a partir da mesma arte do `favicon.svg`, sem dependência de build.                                                                                                                       |

Só dois pacotes de propósito: Capacitor e um eventual build de arquivo único reempacotam
o _output_ de `apps/web`, não componentes soltos — um `packages/ui` separado seria
cerimônia sem consumidor.

---

## Testes

```bash
npm test              # unitários + componentes
npm run test:coverage # com o gate de 90% do core
npm run test:e2e      # ponta a ponta
```

Três camadas:

- **`packages/core`** roda em Node puro, sem jsdom. É assim que a regra "o core não toca
  em DOM" fica verificável: qualquer acesso a `window` ou `document` estoura no teste.
  Cobertura mínima de 90% de linhas, travada por threshold — abaixo disso o build falha.
- **`apps/web`** roda em jsdom com Testing Library. As chamadas de rede são interceptadas
  por MSW, então nenhum teste toca a API de verdade.
- **E2E** com Playwright. Fica fora do CI: os browsers do Playwright são binários glibc e
  não rodam na imagem alpine do builds.sr.ht.

Todo requisito de `docs/REQUIREMENTS.md` tem pelo menos um teste apontando para ele, e o
teste entra no mesmo commit do código.

---

## Migrando da v1

A v1 era um único script Flask (`app_anilist.py`) que subia um servidor local, guardava
Client ID **e Client Secret** num `.env` e comparava sua lista contra um `out.json` num
caminho fixo. Nada disso existe mais:

| v1                                   | v2                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Servidor Flask em `localhost:3000`   | Nada roda no seu computador — o app é o próprio navegador.                                          |
| `.env` com `ANILIST_CLIENT_SECRET`   | Nenhum segredo versionado. Client ID e Secret são informados na interface e ficam no seu navegador. |
| `out.json` lido da raiz do projeto   | Snapshot importado por seletor de arquivo, de onde você quiser.                                     |
| Redirect URI `.../callback`          | Redirect URI é a origem: `http://localhost:3000`, sem caminho.                                      |
| `docker compose up` com volume e env | `docker compose -f deploy/docker-compose.yml up`, sem volume e sem env.                             |

**Seu `out.json` continua valendo** — abra a tela de snapshot e importe o arquivo. Só
lembre que ele está na **escala antiga**: marque a opção _"este snapshot está na escala
antiga"_ no diff, senão cada entrada vai aparecer como divergente. Com a opção ligada, um
snapshot pré-conversão comparado contra uma conta já convertida dá zero divergências.

Os arquivos do Python não estão mais versionados: foram removidos em `a5521ce`. Para
consultá-los, use a tag `0.0.3`, o último ponto em que a v1 existia.

---

## Backlog

Fora desta versão, mas viabilizados pela arquitetura:

- **APK Android** via Capacitor, reempacotando o mesmo `dist/`, com redirect por custom
  scheme (`anilistmgr://auth`). Como não há proxy dentro do APK, ou ele embarca um
  pequeno handler nativo para a troca do código, ou usa o caminho de colar token.
- **HTML de arquivo único** via `vite-plugin-singlefile` — essencialmente um segundo
  config de build.
- **CLI Node** consumindo `packages/core` direto, para automação em lote e cron.
- **Suporte a MANGA** (`MediaListCollection(type: MANGA)`), que usa a mesma API.
- **Desktop nativo** via Tauri.
- Edição de outros campos além de `priority` (score, progresso, status, notas).

---

## Licença

[GPL-3](https://www.gnu.org/licenses/gpl-3.0.txt)
