<script lang="ts">
  /**
   * A grid da lista. Ver RF-10, RF-11, RF-17 e RF-18.
   *
   * O ag-grid é imperativo, então o componente é fino: cria a grid uma vez e
   * empurra `rowData` sempre que as entradas filtradas mudam. Nenhuma regra de
   * ordenação ou filtro nasce aqui — as colunas vêm de `lib/grid.ts` e o
   * comparador de prioridade é `comparePriority`, do core.
   */
  import { createGrid, type GridApi, type GridOptions } from 'ag-grid-community';
  import type { AnimeEntry, Priority } from '@anilist-updater/core';
  import { anilistGridTheme, buildColumnDefs, registerGridModules } from '../lib/grid.js';
  import { createPriorityCellRenderer } from '../lib/priorityCellRenderer.svelte.js';

  interface Props {
    entries: readonly AnimeEntry[];
    /** Deve rejeitar em caso de falha: é o que faz o picker mostrar ✗. */
    onpriority: (entry: AnimeEntry, priority: Priority) => Promise<void>;
  }

  const { entries, onpriority }: Props = $props();

  registerGridModules();

  let host: HTMLDivElement;
  let api: GridApi<AnimeEntry> | undefined;

  const options: GridOptions<AnimeEntry> = {
    theme: anilistGridTheme,
    // A grid é criada uma vez só, então o renderer chama a prop por closure em
    // vez de capturar o valor inicial dela.
    columnDefs: buildColumnDefs(
      createPriorityCellRenderer((entry, priority) => onpriority(entry, priority)),
    ),
    defaultColDef: { resizable: true, suppressMovable: false },
    // São nove colunas: virtualizar não economiza nada e faria a célula de
    // prioridade (um componente Svelte montado à mão) só existir quando visível.
    suppressColumnVirtualisation: true,
    // Ver RF-10: a chave é o mediaId, então trocar a prioridade não recria a linha.
    getRowId: (params) => String(params.data.id),
    animateRows: true,
    pagination: false,
    rowHeight: 44,
    headerHeight: 40,
    floatingFiltersHeight: 36,
    suppressCellFocus: false,
    localeText: { noRowsToShow: 'Nenhum anime corresponde aos filtros.' },
  };

  $effect(() => {
    api = createGrid(host, options);
    return () => {
      api?.destroy();
      api = undefined;
    };
  });

  // Cada mudança no resultado do filtro reflete na grid, sem recriá-la.
  $effect(() => {
    api?.setGridOption('rowData', [...entries]);
  });
</script>

<div class="grid" bind:this={host} data-testid="anime-grid"></div>

<style>
  .grid {
    flex: 1;
    min-height: 240px;
  }

  /* A capa é renderizada por um cell renderer em JS puro, fora do escopo do
     Svelte — daí o :global. */
  .grid :global(img.cover) {
    width: 32px;
    height: 45px;
    object-fit: cover;
    border-radius: 3px;
    display: block;
  }
</style>
