<script lang="ts">
  /**
   * Casca da aplicação: consome o retorno do OAuth, decide entre login e app,
   * e roteia entre as três telas.
   *
   * O retorno do OAuth chega em `?code=…` na QUERY, não no fragmento — o code
   * grant não disputa o hash com o roteador (ao contrário do implicit grant, que
   * o AniList não suporta; ver o cabeçalho de `packages/core/src/auth.ts`).
   *
   * Em compensação a troca do código é uma chamada de rede, então o boot é
   * assíncrono: `createAuth` monta primeiro a partir do storage, e o desfecho do
   * callback é aplicado quando a troca termina.
   */
  import { consumeAuthCallback, createAuth } from './lib/auth.svelte.js';
  import { createRouter } from './lib/router.svelte.js';
  import { createSession } from './lib/session.svelte.js';
  import { createTokenStore } from './lib/tokenStore.js';
  import { ROUTES, ROUTE_LABELS, routeHref } from './lib/router.js';
  import AuthScreen from './routes/AuthScreen.svelte';
  import ListScreen from './routes/ListScreen.svelte';
  import ConversionScreen from './routes/ConversionScreen.svelte';
  import SnapshotScreen from './routes/SnapshotScreen.svelte';

  const store = createTokenStore();
  const auth = createAuth({ store });

  // A troca do código roda em paralelo à montagem; enquanto ela não volta, a tela
  // de login fica visível com o aviso de "trocando o código".
  let exchanging = $state(location.search.includes('code='));

  void consumeAuthCallback(store)
    .then((outcome) => {
      if (outcome !== null) auth.applyCallback(outcome);
    })
    .finally(() => {
      exchanging = false;
    });
  const session = createSession({
    // RF-05: um 401 desloga e leva de volta ao login com o motivo na tela.
    onAuthError: (message) => {
      auth.logout(message);
    },
  });
  const router = createRouter();

  /**
   * Guarda de "já carreguei com este token". Sem ela, o efeito dispararia de
   * novo a cada mudança de estado da sessão e a lista entraria em laço.
   */
  let loadedFor: string | null = null;

  $effect(() => {
    const token = auth.token;
    if (token === null) {
      loadedFor = null;
      session.reset();
      return;
    }
    if (loadedFor === token.accessToken) return;
    loadedFor = token.accessToken;
    void session.refresh(token.accessToken);
  });

  function reload(): void {
    const token = auth.token;
    if (token === null) return;
    void session.refresh(token.accessToken);
  }

  function logout(): void {
    auth.logout('Você saiu. O Client ID continua salvo neste navegador.');
  }
</script>

{#if !auth.authenticated}
  <AuthScreen {auth} {exchanging} />
{:else}
  <header class="bar">
    <h1>AniList Manager</h1>

    <nav aria-label="Seções">
      {#each ROUTES as route (route)}
        <a
          href={routeHref(route)}
          aria-current={router.current === route ? 'page' : undefined}
          class:current={router.current === route}
        >
          {ROUTE_LABELS[route]}
        </a>
      {/each}
    </nav>

    <div class="right">
      <button type="button" onclick={reload} disabled={session.loading}>
        {session.loading ? 'Carregando…' : 'Recarregar'}
      </button>
      <button type="button" onclick={logout}>Sair</button>
    </div>
  </header>

  <main>
    {#if router.current === 'lista'}
      <ListScreen {session} token={auth.token?.accessToken ?? ''} onreload={reload} />
    {:else if router.current === 'converter'}
      <ConversionScreen {session} token={auth.token?.accessToken ?? ''} />
    {:else}
      <SnapshotScreen {session} />
    {/if}
  </main>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  h1 {
    font-size: 0.95rem;
    white-space: nowrap;
  }

  nav {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  nav a {
    color: var(--fg-muted);
    text-decoration: none;
    font-size: 0.82rem;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  nav a:hover {
    color: var(--fg);
  }

  nav a.current {
    color: var(--fg);
    border-color: var(--border);
    background: var(--bg);
  }

  .right {
    display: flex;
    gap: 8px;
  }

  button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
    padding: 6px 12px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: progress;
  }

  main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
  }
</style>
