<script lang="ts">
  /**
   * Tela de lista: filtros facetados + grid. Escopo B, RF-10 a RF-18.
   *
   * Segura o `FilterState` e delega tudo o mais: `applyFilter` decide o que
   * aparece, `computeFacets` (dentro da FilterBar) conta, e a sessão escreve.
   */
  import {
    applyFilter,
    type AnimeEntry,
    type FilterState,
    type Priority,
  } from '@anilist-updater/core';
  import FilterBar from '../components/FilterBar.svelte';
  import AnimeGrid from '../components/AnimeGrid.svelte';
  import { loadFilter } from '../lib/filterStore.js';
  import type { Session } from '../lib/session.svelte.js';

  interface Props {
    session: Session;
    token: string;
    onreload: () => void;
  }

  const { session, token, onreload }: Props = $props();

  // Ver RF-16: o filtro da sessão anterior volta ativo.
  let filter = $state<FilterState>(loadFilter());

  const visible = $derived(applyFilter(session.entries, filter));

  async function writePriority(entry: AnimeEntry, priority: Priority): Promise<void> {
    // Deixa a exceção subir: o PriorityPicker depende dela para mostrar ✗ (RF-18).
    await session.updatePriority(token, entry.id, priority);
  }
</script>

<div class="screen">
  {#if session.error}
    <p class="alert" role="alert">
      {session.error}
      <button type="button" onclick={onreload}>Tentar de novo</button>
    </p>
  {/if}

  {#if session.loading}
    <p class="muted" role="status">Carregando sua lista do AniList…</p>
  {:else if session.entries.length === 0}
    <p class="muted" role="status">
      Nenhum anime carregado.
      <button type="button" onclick={onreload}>Carregar lista</button>
    </p>
  {:else}
    <FilterBar
      entries={session.entries}
      {filter}
      resultCount={visible.length}
      onchange={(next: FilterState) => {
        filter = next;
      }}
    />
    <AnimeGrid entries={visible} onpriority={writePriority} />
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .muted {
    color: var(--fg-muted);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alert {
    background: #3d1d1d;
    border: 1px solid #7a2f2f;
    color: #ffb4b4;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }

  button {
    background: transparent;
    border: 1px solid var(--border);
    color: inherit;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
    padding: 5px 10px;
    cursor: pointer;
  }
</style>
