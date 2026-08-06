<script lang="ts">
  /**
   * Tela de setup e login. Escopo A: RF-01 a RF-06.
   *
   * Nenhuma decisão de OAuth acontece aqui — `buildAuthorizeUrl`,
   * `parseAuthCallback` e `exchangeCodeForToken` são do core. Esta tela só coleta
   * as credenciais do client do usuário, dispara o redirect e oferece o caminho
   * alternativo de colar o token (RF-04).
   */
  import type { Auth } from '../lib/auth.svelte.js';
  import { currentRedirectUri } from '../lib/auth.svelte.js';

  interface Props {
    auth: Auth;
    /** `true` enquanto a troca do authorization code está em voo. */
    exchanging?: boolean;
  }

  const { auth, exchanging = false }: Props = $props();

  // Cópias locais editáveis: os campos são rascunho até o submit persistir (RF-01).
  // svelte-ignore state_referenced_locally
  let clientIdField = $state(auth.clientId);
  // svelte-ignore state_referenced_locally
  let clientSecretField = $state(auth.clientSecret);
  let pastedToken = $state('');
  let pasteRequested = $state(false);
  /**
   * Sem proxy na hospedagem, colar token deixa de ser alternativa e vira o caminho.
   * Precisa ser derivado: `manualTokenOnly` só fica verdadeiro quando a troca do
   * código falha, o que acontece **depois** desta tela montar.
   */
  const showPasteField = $derived(pasteRequested || auth.manualTokenOnly);

  const redirectUri = currentRedirectUri();
  const credentialsReady = $derived(clientIdField.trim() !== '' && clientSecretField.trim() !== '');

  function handleLogin(event: SubmitEvent): void {
    event.preventDefault();
    // RF-01/RF-02: as credenciais são persistidas antes do redirect — na volta,
    // a troca do código precisa do secret e a página já foi recarregada.
    auth.setClientId(clientIdField);
    auth.setClientSecret(clientSecretField);
    auth.login();
  }

  function handlePaste(event: SubmitEvent): void {
    event.preventDefault();
    auth.setClientId(clientIdField);
    if (auth.pasteToken(pastedToken)) {
      pastedToken = '';
    }
  }
</script>

<main class="setup">
  <header>
    <h1>AniList Manager</h1>
    <p class="sub">
      Roda inteiro no seu navegador. Nenhum dado sai daqui além das chamadas à API do AniList.
    </p>
  </header>

  {#if auth.message}
    <p class="alert" role="alert">{auth.message}</p>
  {/if}

  <section class="card">
    <h2>1. Credenciais do seu client</h2>
    <ol class="howto">
      <li>
        Crie um client em
        <a href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer noopener">
          anilist.co/settings/developer
        </a>.
      </li>
      <li>
        Configure o <strong>Redirect URI</strong> exatamente como:
        <code class="redirect">{redirectUri}</code>
      </li>
      <li>Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> e cole abaixo.</li>
    </ol>

    <form onsubmit={handleLogin}>
      <label for="client-id">Client ID</label>
      <input
        id="client-id"
        name="clientId"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="12345"
        bind:value={clientIdField}
      />

      <label for="client-secret">Client Secret</label>
      <input
        id="client-secret"
        name="clientSecret"
        type="password"
        autocomplete="off"
        placeholder="••••••••••••••••"
        bind:value={clientSecretField}
      />
      <p class="hint">
        O AniList não permite login sem a troca do código, e essa troca exige o secret. Ele é do
        <em>seu</em> client, fica só neste navegador e é apagado quando você sai. O Client ID, que é configuração
        e não credencial, permanece.
      </p>

      <button class="primary" type="submit" disabled={!credentialsReady || exchanging}>
        {exchanging ? 'Trocando o código…' : 'Entrar com AniList'}
      </button>
    </form>
  </section>

  <section class="card">
    <h2>2. Ou cole um access token</h2>
    {#if auth.manualTokenOnly}
      <p class="hint">
        Esta hospedagem serve só arquivos estáticos, sem o proxy que a troca do código exige — o
        AniList não libera CORS no endpoint de token. Faça a troca você mesmo (o token vale um ano)
        e cole o resultado aqui.
      </p>
    {:else}
      <p class="hint">
        Alternativa ao redirect, útil se você já tem um token em mãos ou se o redirect não puder ser
        configurado.
      </p>
    {/if}

    {#if showPasteField}
      <form onsubmit={handlePaste}>
        <label for="access-token">Access token</label>
        <input
          id="access-token"
          name="accessToken"
          type="password"
          autocomplete="off"
          placeholder="eyJ0eXAiOiJKV1Qi…"
          bind:value={pastedToken}
        />
        <button class="primary" type="submit">Usar este token</button>
      </form>
    {:else}
      <button
        class="ghost"
        type="button"
        onclick={() => {
          pasteRequested = true;
        }}
      >
        Colar token manualmente
      </button>
    {/if}
  </section>
</main>

<style>
  .setup {
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
    padding: 32px 20px 64px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  h1 {
    font-size: 1.5rem;
  }

  h2 {
    font-size: 0.95rem;
    margin-bottom: 10px;
  }

  .sub,
  .hint {
    color: var(--fg-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px;
  }

  .howto {
    color: var(--fg-muted);
    font-size: 0.82rem;
    line-height: 1.7;
    padding-left: 18px;
    margin-bottom: 14px;
  }

  .redirect {
    display: block;
    margin-top: 4px;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font-size: 0.78rem;
    word-break: break-all;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  label {
    font-size: 0.78rem;
    color: var(--fg-muted);
  }

  input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font: inherit;
    font-size: 0.88rem;
    padding: 9px 10px;
  }

  button {
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: 6px;
    padding: 9px 14px;
    cursor: pointer;
    align-self: flex-start;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .primary {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: #fff;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
  }

  .alert {
    background: #3d1d1d;
    border: 1px solid #7a2f2f;
    color: #ffb4b4;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
  }

  a {
    color: var(--accent);
  }
</style>
