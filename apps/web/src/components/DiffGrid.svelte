<script lang="ts">
  /**
   * Grid do diff entre snapshot e lista viva. Ver RF-33.
   *
   * Reusa o mesmo tema e os mesmos módulos da grid da lista — é o mesmo ag-grid,
   * só com outras colunas. As linhas vêm prontas de `diffSnapshot`; aqui não se
   * compara nada.
   */
  import { createGrid, type ColDef, type GridApi, type GridOptions } from 'ag-grid-community';
  import type { DiffRow } from '@anilist-updater/core';
  import { anilistGridTheme, registerGridModules } from '../lib/grid.js';

  interface Props {
    rows: readonly DiffRow[];
  }

  const { rows }: Props = $props();

  registerGridModules();

  let host: HTMLDivElement;
  let api: GridApi<DiffRow> | undefined;

  /** Traduz a linha em uma das três situações que o RF-33 pede. */
  function situation(row: DiffRow): string {
    if (row.actual === null) return 'Ausente da conta';
    return row.ok ? 'Igual' : 'Divergente';
  }

  const columnDefs: ColDef<DiffRow>[] = [
    {
      field: 'name',
      headerName: 'Anime',
      flex: 3,
      minWidth: 180,
      sortable: true,
      filter: 'agTextColumnFilter',
      floatingFilter: true,
    },
    { field: 'expected', headerName: 'No snapshot', width: 120, sortable: true },
    {
      field: 'actual',
      headerName: 'Na conta',
      width: 110,
      sortable: true,
      valueFormatter: (params) => (params.value === null ? '—' : String(params.value)),
    },
    {
      headerName: 'Situação',
      colId: 'situation',
      width: 150,
      sortable: true,
      valueGetter: (params) => (params.data === undefined ? '' : situation(params.data)),
      cellClassRules: {
        'diff-ok': (params) => params.data?.ok === true,
        'diff-bad': (params) => params.data?.ok === false,
      },
    },
  ];

  const options: GridOptions<DiffRow> = {
    theme: anilistGridTheme,
    columnDefs,
    defaultColDef: { resizable: true },
    getRowId: (params) => String(params.data.id),
    rowHeight: 34,
    headerHeight: 36,
    floatingFiltersHeight: 32,
    suppressColumnVirtualisation: true,
    localeText: { noRowsToShow: 'Nenhuma linha no diff.' },
  };

  $effect(() => {
    api = createGrid(host, options);
    return () => {
      api?.destroy();
      api = undefined;
    };
  });

  $effect(() => {
    api?.setGridOption('rowData', [...rows]);
  });
</script>

<div class="grid" bind:this={host} data-testid="diff-grid"></div>

<style>
  .grid {
    height: 340px;
  }

  /* Classes aplicadas pelo ag-grid, fora do escopo do Svelte. */
  .grid :global(.diff-ok) {
    color: #7ee2a8;
  }

  .grid :global(.diff-bad) {
    color: #ffb4b4;
  }
</style>
