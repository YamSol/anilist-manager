# AniList Priority Updater

App em Python/Flask para atualizar priorities na sua lista do AniList

## Setup

1. **Pega suas credenciais em https://anilist.co/settings/developer**
   - Client ID
   - Client Secret
   - Configura Redirect URI como: `http://localhost:3000/callback`

2. **Preenche no `app_anilist.py`** (linhas 9-10)
   ```python
   CLIENT_ID = "seu_client_id"
   CLIENT_SECRET = "seu_client_secret"
   ```

3. **Instala dependências**
   ```bash
   pip install -r requirements.txt
   ```

4. **Coloca seu `out.json` na mesma pasta**

5. **Roda**
   ```bash
   python app_anilist.py
   ```

## Como usar

- O navegador abre automaticamente em `http://localhost:3000/`
- Redireciona pra AniList pra você aceitar o acesso
- Autoriza e volta pro app
- Acessa `http://localhost:3000/update` pra rodar a atualização
- Vê o resultado na tela

