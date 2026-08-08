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
  let copiado = $state<'nada' | 'comando' | 'redirect'>('nada');

  const redirectUri = currentRedirectUri();
  const credentialsReady = $derived(clientIdField.trim() !== '' && clientSecretField.trim() !== '');

  /**
   * Ver RF-08. Sem proxy e com o code já capturado, a troca no console deixa de
   * ser alternativa e passa a ser o caminho — e é o único momento em que faz
   * sentido mostrá-la, porque antes disso não há code para trocar.
   */
  const guiandoTroca = $derived(auth.exchangeSnippet !== null);

  /**
   * O campo de colar aparece sozinho quando o usuário voltou sem proxy: ali ele
   * tem uma resposta na mão e precisa de onde pôr.
   */
  const showPasteField = $derived(pasteRequested || auth.manualTokenOnly);

  async function copiar(texto: string, marca: 'comando' | 'redirect'): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      copiado = marca;
    } catch {
      // Clipboard bloqueada (permissão, http sem localhost): o texto continua
      // visível e selecionável na tela, então não há nada a recuperar.
      copiado = 'nada';
    }
  }

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
    if (auth.submitTokenResponse(pastedToken)) {
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
    <h2>1. Crie um client no AniList</h2>
    <ol class="howto">
      <li>
        Abra
        <a href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer noopener">
          anilist.co/settings/developer
        </a>
        e crie um client.
      </li>
      <li>
        Cole isto no campo <strong>Redirect URI</strong>, exatamente assim:
        <code class="redirect">{redirectUri}</code>
        <button
          class="ghost small"
          type="button"
          onclick={() => void copiar(redirectUri, 'redirect')}
        >
          {copiado === 'redirect' ? 'Copiado' : 'Copiar'}
        </button>
      </li>
      <li>Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> gerados.</li>
    </ol>
  </section>

  <section class="card">
    <h2>2. Informe as credenciais</h2>

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
        Os dois ficam só neste navegador. O secret é apagado quando você sai; o Client ID, que é
        configuração e não credencial, permanece.
      </p>

      {#if auth.proxyStatus === 'ausente' && !guiandoTroca}
        <p class="aviso">
          Esta hospedagem serve só arquivos, então o login tem <strong>um passo a mais</strong>:
          depois de autorizar, você vai colar um comando no console do navegador. Leva menos de um
          minuto e o app te guia.
        </p>
      {/if}

      <button class="primary" type="submit" disabled={!credentialsReady || exchanging}>
        {exchanging ? 'Trocando o código…' : 'Entrar com AniList'}
      </button>
    </form>
  </section>

  {#if guiandoTroca}
    <section class="card destaque">
      <h2>3. Último passo</h2>
      <p class="hint">
        Você autorizou, e o app já capturou o código. Só falta trocá-lo por um token — o que precisa
        acontecer a partir do próprio AniList.
      </p>
      <ol class="howto">
        <li>
          Abra
          <a href="https://anilist.co" target="_blank" rel="noreferrer noopener">anilist.co</a>
          numa aba nova e pressione <kbd>F12</kbd> para abrir o console.
        </li>
        <li>
          Cole o comando abaixo lá e pressione <kbd>Enter</kbd>. Ele já vai preenchido.
          <pre class="snippet">{auth.exchangeSnippet}</pre>
          <button
            class="primary small"
            type="button"
            onclick={() => void copiar(auth.exchangeSnippet ?? '', 'comando')}
          >
            {copiado === 'comando' ? 'Comando copiado' : 'Copiar comando'}
          </button>
        </li>
        <li>Cole aqui a resposta que aparecer no console:</li>
      </ol>

      <form onsubmit={handlePaste}>
        <label for="token-response">Resposta do AniList</label>
        <textarea
          id="token-response"
          name="tokenResponse"
          rows="4"
          autocomplete="off"
          placeholder={'{"token_type":"Bearer","expires_in":31536000,"access_token":"…"}'}
          bind:value={pastedToken}
        ></textarea>
        <button class="primary" type="submit">Concluir login</button>
      </form>
    </section>
  {:else}
    <section class="card">
      <h2>Já tem um access token?</h2>
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
  {/if}
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

  input,
  textarea {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font: inherit;
    font-size: 0.88rem;
    padding: 9px 10px;
  }

  textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    resize: vertical;
  }

  .destaque {
    border-color: var(--accent);
  }

  .aviso {
    background: #3a2f14;
    border: 1px solid #6b5520;
    color: #f0d79a;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .snippet {
    display: block;
    margin: 8px 0;
    padding: 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    /* O snippet tem linhas longas de propósito (o secret e o code são enormes):
       rolar na horizontal preserva a estrutura melhor que quebrar no meio. */
    overflow-x: auto;
    white-space: pre;
  }

  kbd {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.72rem;
  }

  .small {
    font-size: 0.75rem;
    padding: 5px 10px;
    margin-top: 4px;
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
