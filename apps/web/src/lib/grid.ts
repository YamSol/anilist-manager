/**
 * Configuração do ag-grid: módulos, tema e definições de coluna.
 *
 * O ag-grid agora vem do npm, não de CDN (AD-08, RNF-05) — sem isso a casca não
 * funcionaria offline. Como ele é a dependência mais pesada do bundle (RNF-06),
 * registramos **só os módulos que a tela usa** em vez de `AllCommunityModule`.
 * Se alguma coluna passar a precisar de um recurso novo, o próprio grid avisa em
 * dev qual módulo falta (é para isso que `ValidationModule` está aqui).
 */

import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  LocaleModule,
  ModuleRegistry,
  NumberFilterModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
  colorSchemeDark,
  themeQuartz,
  type ColDef,
  type Theme,
  type ValueGetterParams,
} from 'ag-grid-community';
import { comparePriority, type AnimeEntry, type Priority } from '@anilist-updater/core';
import { formatLabel, seasonLabel, statusLabel } from './labels.js';

let registered = false;

/** Idempotente: a tela pode remontar, o registro global não pode duplicar. */
export function registerGridModules(): void {
  if (registered) return;
  registered = true;
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    TextFilterModule,
    NumberFilterModule,
    ColumnApiModule,
    ColumnAutoSizeModule,
    CellStyleModule,
    RowStyleModule,
    TooltipModule,
    // RNF-10: os textos que o próprio grid emite ("nenhuma linha") em pt-BR.
    LocaleModule,
    // Só em dev: em produção ele vira peso morto e mensagens de erro verbosas.
    ...(import.meta.env.DEV ? [ValidationModule] : []),
  ]);
}

/**
 * Tema escuro herdado da v1 (`app_anilist.py:149-176`), que era um bloco de
 * `--ag-*` em cima do `ag-theme-alpine`. Agora usa a Theming API e lê as mesmas
 * cores de `app.css` por `var(--…)`: uma fonte de verdade para toda a UI.
 */
export const anilistGridTheme: Theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: 'var(--bg)',
  foregroundColor: 'var(--fg)',
  headerBackgroundColor: 'var(--bg-elevated)',
  headerTextColor: 'var(--fg-muted)',
  oddRowBackgroundColor: 'var(--bg)',
  rowHoverColor: 'var(--bg-elevated)',
  selectedRowBackgroundColor: 'var(--selected)',
  borderColor: 'var(--border)',
  wrapperBorderRadius: '6px',
  fontSize: '13px',
  cellHorizontalPadding: '10px',
});

function progressText(entry: AnimeEntry): string {
  return entry.episodes === null
    ? String(entry.progress)
    : `${String(entry.progress)}/${String(entry.episodes)}`;
}

/**
 * Colunas da lista. Herdam as três da v1 (`app_anilist.py:242-271`) — nome,
 * lista(s) e prioridade — e acrescentam o que os filtros facetados exigem (RF-11).
 *
 * `priorityCellRenderer` é injetado porque ele precisa da sessão para escrever;
 * este módulo não conhece rede.
 */
export function buildColumnDefs(priorityCellRenderer: unknown): ColDef<AnimeEntry>[] {
  return [
    {
      headerName: '',
      field: 'coverImage',
      width: 52,
      minWidth: 52,
      maxWidth: 52,
      sortable: false,
      resizable: false,
      cellRenderer: (params: { value: unknown; data?: AnimeEntry }): HTMLElement | string => {
        if (typeof params.value !== 'string') return '';
        const img = document.createElement('img');
        img.src = params.value;
        img.alt = '';
        img.loading = 'lazy';
        img.className = 'cover';
        return img;
      },
    },
    {
      field: 'title',
      headerName: 'Nome',
      flex: 3,
      minWidth: 180,
      filter: 'agTextColumnFilter',
      floatingFilter: true,
      sortable: true,
      tooltipField: 'title',
    },
    {
      field: 'lists',
      headerName: 'Lista(s)',
      flex: 2,
      minWidth: 120,
      filter: 'agTextColumnFilter',
      floatingFilter: true,
      sortable: true,
      valueGetter: (params: ValueGetterParams<AnimeEntry>) => params.data?.lists.join(', ') ?? '',
    },
    {
      field: 'priority',
      headerName: 'Prioridade',
      width: 240,
      minWidth: 240,
      filter: 'agNumberColumnFilter',
      sortable: true,
      cellRenderer: priorityCellRenderer,
      // Ver RF-17: 0 vai para o fim nas duas direções. A regra é do core.
      comparator: (a: Priority, b: Priority) => comparePriority(a, b),
    },
    {
      field: 'format',
      headerName: 'Formato',
      width: 110,
      sortable: true,
      valueFormatter: (params: { value: unknown }) =>
        formatLabel((params.value ?? null) as AnimeEntry['format']),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      sortable: true,
      valueFormatter: (params: { value: unknown }) =>
        statusLabel((params.value ?? null) as AnimeEntry['status']),
    },
    {
      field: 'averageScore',
      headerName: 'Score',
      width: 90,
      sortable: true,
      filter: 'agNumberColumnFilter',
      valueFormatter: (params: { value: unknown }) =>
        typeof params.value === 'number' ? String(params.value) : '—',
    },
    {
      headerName: 'Progresso',
      colId: 'progress',
      width: 110,
      sortable: true,
      valueGetter: (params: ValueGetterParams<AnimeEntry>) =>
        params.data === undefined ? '' : progressText(params.data),
    },
    {
      headerName: 'Temporada',
      colId: 'season',
      width: 130,
      sortable: true,
      valueGetter: (params: ValueGetterParams<AnimeEntry>) =>
        params.data === undefined ? '' : seasonLabel(params.data.season, params.data.seasonYear),
    },
  ];
}
