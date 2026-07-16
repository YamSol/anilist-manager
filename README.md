# AniList Priority Updater

App em Python/Flask para atualizar e verificar priorities na sua lista do AniList.

## Setup

1. **Cria e ativa a venv**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Instala as dependências**
   ```bash
   pip install -r requirements.txt
   ```

3. **Pega suas credenciais em https://anilist.co/settings/developer**
   - Client ID
   - Client Secret
   - Configura Redirect URI como: `http://localhost:3000/callback`

4. **Copia `.env.example` pra `.env` e preenche**
   ```bash
   cp .env.example .env
   # edita .env com ANILIST_CLIENT_ID e ANILIST_CLIENT_SECRET
   ```

5. **Coloca seu `out.json` na raiz do projeto** (lista de referência usada em `/check`)
   ```json
   [
     {"id": 12345, "name": "Nome do anime", "priority": 3}
   ]
   ```

6. **Roda**
   ```bash
   python app_anilist.py
   ```

   Ou, se preferir usar o launcher instalado (`~/.local/bin/anilist-updater`, symlink
   que aponta pra `anilist-updater.sh` deste diretório e roda com o Python da venv):
   ```bash
   anilist-updater
   ```

## Rodando com Docker

Alternativa ao setup manual — não precisa de venv nem Python local.

1. Cria `.env` a partir do `.env.example` (passo 4 acima) e coloca seu `out.json` na raiz.
2. Sobe:
   ```bash
   docker compose up --build
   ```
3. Acessa `http://localhost:3000/` no navegador do host normalmente.

O `out.json` é montado como volume (somente leitura), então dá pra editar ele
sem rebuildar a imagem. Pra rodar em background: `docker compose up -d --build`.
Pra parar: `docker compose down`.

## Como usar

- O navegador abre automaticamente em `http://localhost:3000/`
- Redireciona pra AniList pra você aceitar o acesso
- Autoriza e volta pro app
- Acessa `http://localhost:3000/list` pra editar priorities
- Acessa `http://localhost:3000/check` pra comparar contra o `out.json`

## Estrutura

- `app_anilist.py` — app Flask (OAuth, rotas, chamadas à API GraphQL do AniList)
- `anilist-updater.sh` — launcher usado pelo symlink em `~/.local/bin/anilist-updater`
- `Dockerfile` / `docker-compose.yml` — build e run em container
- `.env` — credenciais (não versionado)
- `out.json` — lista de referência local usada em `/check` (não versionado)
