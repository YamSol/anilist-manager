<script lang="ts">
  /**
   * Filtro facetado + busca textual. Ver RF-13 a RF-16.
   *
   * Zero semântica de filtro aqui: quem decide o que casa é `matchesFilter` e
   * quem conta é `computeFacets`, ambos do core. Este componente só desenha as
   * opções, alterna valores num array e devolve o `FilterState` novo.
   *
   * AND entre facetas, OR dentro de uma faceta — regra do core, não daqui.
   */
  import {
    computeFacets,
    EMPTY_FILTER,
    PRIORITY_LABELS,
    type AnimeEntry,
    type FilterState,
    type ListStatus,
    type MediaFormat,
    type Priority,
  } from '@anilist-updater/core';
  import { FORMAT_LABELS, STATUS_LABELS } from '../lib/labels.js';
  import { isFilterActive, saveFilter } from '../lib/filterStore.js';

  interface Props {
    /** Coleção completa: as contagens das facetas são sempre sobre o total. */
    entries: readonly AnimeEntry[];
    filter: FilterState;
    /** Quantas entradas sobraram depois de aplicar o filtro. */
    resultCount: number;
    onchange: (filter: FilterState) => void;
  }

  const { entries, filter, resultCount, onchange }: Props = $props();

  const facets = $derived(computeFacets(entries));
  const active = $derived(isFilterActive(filter));

  /**
   * Ver RF-16. A persistência mora aqui porque este é o componente dono do
   * `FilterState`: qualquer caminho que altere um filtro passa por `update`.
   */
  function update(next: FilterState): void {
    saveFilter(next);
    onchange(next);
  }

  /** Alterna um valor dentro de uma faceta (OR interno). */
  function toggle<T>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function toggleFormat(value: MediaFormat): void {
    update({ ...filter, formats: toggle(filter.formats, value) });
  }

  function toggleStatus(value: ListStatus): void {
    update({ ...filter, statuses: toggle(filter.statuses, value) });
  }

  function togglePriority(value: Priority): void {
    update({ ...filter, priorities: toggle(filter.priorities, value) });
  }

  function toggleGenre(value: string): void {
    update({ ...filter, genres: toggle(filter.genres, value) });
  }

  function toggleList(value: string): void {
    update({ ...filter, lists: toggle(filter.lists, value) });
  }

  function setText(value: string): void {
    update({ ...filter, text: value });
  }

  function setScore(bound: 'minScore' | 'maxScore', raw: string): void {
    const parsed = raw.trim() === '' ? null : Number(raw);
    update({ ...filter, [bound]: parsed !== null && Number.isFinite(parsed) ? parsed : null });
  }

  function clearAll(): void {
    update(EMPTY_FILTER);
  }
</script>

<section class="filters" aria-label="Filtros">
  <div class="top">
    <label class="search">
      <span class="sr-only">Buscar por título</span>
      <input
        type="search"
        placeholder="Buscar por título…"
        value={filter.text}
        oninput={(event) => {
          setText(event.currentTarget.value);
        }}
      />
    </label>

    <p class="count" role="status">
      {resultCount} de {entries.length} animes
    </p>

    <button type="button" class="ghost" disabled={!active} onclick={clearAll}>
      Limpar filtros
    </button>
  </div>

  <div class="facets">
    <fieldset>
      <legend>Prioridade</legend>
      {#each facets.priorities as facet (facet.value)}
        <label>
          <input
            type="checkbox"
            checked={filter.priorities.includes(facet.value)}
            onchange={() => {
              togglePriority(facet.value);
            }}
          />
          <span>{facet.value} · {PRIORITY_LABELS[facet.value]}</span>
          <span class="badge">{facet.count}</span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Formato</legend>
      {#each facets.formats as facet (facet.value)}
        <label>
          <input
            type="checkbox"
            checked={filter.formats.includes(facet.value)}
            onchange={() => {
              toggleFormat(facet.value);
            }}
          />
          <span>{FORMAT_LABELS[facet.value]}</span>
          <span class="badge">{facet.count}</span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Status</legend>
      {#each facets.statuses as facet (facet.value)}
        <label>
          <input
            type="checkbox"
            checked={filter.statuses.includes(facet.value)}
            onchange={() => {
              toggleStatus(facet.value);
            }}
          />
          <span>{STATUS_LABELS[facet.value]}</span>
          <span class="badge">{facet.count}</span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Lista</legend>
      <div class="scroll">
        {#each facets.lists as facet (facet.value)}
          <label>
            <input
              type="checkbox"
              checked={filter.lists.includes(facet.value)}
              onchange={() => {
                toggleList(facet.value);
              }}
            />
            <span>{facet.value}</span>
            <span class="badge">{facet.count}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Gênero</legend>
      <div class="scroll">
        {#each facets.genres as facet (facet.value)}
          <label>
            <input
              type="checkbox"
              checked={filter.genres.includes(facet.value)}
              onchange={() => {
                toggleGenre(facet.value);
              }}
            />
            <span>{facet.value}</span>
            <span class="badge">{facet.count}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Score</legend>
      <label class="score">
        <span>Mínimo</span>
        <input
          type="number"
          min="0"
          max="100"
          value={filter.minScore ?? ''}
          oninput={(event) => {
            setScore('minScore', event.currentTarget.value);
          }}
        />
      </label>
      <label class="score">
        <span>Máximo</span>
        <input
          type="number"
          min="0"
          max="100"
          value={filter.maxScore ?? ''}
          oninput={(event) => {
            setScore('maxScore', event.currentTarget.value);
          }}
        />
      </label>
    </fieldset>
  </div>
</section>

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .search {
    flex: 1;
    min-width: 180px;
  }

  input[type='search'],
  input[type='number'] {
    width: 100%;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    padding: 7px 9px;
  }

  .count {
    color: var(--fg-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
    padding: 7px 12px;
    cursor: pointer;
  }

  .ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .facets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }

  fieldset {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px 10px;
    min-width: 0;
  }

  legend {
    color: var(--fg-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 4px;
  }

  .scroll {
    max-height: 132px;
    overflow-y: auto;
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    padding: 2px 0;
    cursor: pointer;
  }

  label > span:first-of-type {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    color: var(--fg-muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    background: var(--bg-elevated);
    border-radius: 999px;
    padding: 1px 6px;
  }

  .score span {
    color: var(--fg-muted);
    font-size: 0.75rem;
    width: 52px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
