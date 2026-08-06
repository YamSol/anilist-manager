<script lang="ts">
  /**
   * Snapshot e diff. Escopo D, RF-30 a RF-35.
   *
   * Sucessor do `/check` da v1, que lia um `out.json` de caminho fixo. Num app de
   * browser isso não existe, então virou import por seletor de arquivo e export
   * por Blob (AD-07).
   *
   * Todo o parsing e toda a comparação são do core. O que sobra aqui é ler o
   * arquivo, transformar `SnapshotParseError` em texto legível (RF-31) e
   * desenhar o resultado.
   */
  import {
    diffSnapshot,
    parseSnapshot,
    toSnapshot,
    type Snapshot,
    type SnapshotDiff,
  } from '@anilist-updater/core';
  import DiffGrid from '../components/DiffGrid.svelte';
  import { downloadJson, timestampSuffix } from '../lib/download.js';
  import { errorMessage } from '../lib/labels.js';
  import type { Session } from '../lib/session.svelte.js';

  interface Props {
    session: Session;
  }

  const { session }: Props = $props();

  let snapshot = $state<Snapshot | null>(null);
  let fileName = $state<string | null>(null);
  let parseError = $state<string | null>(null);
  /** RF-34. O `out.json` legado está na escala antiga. */
  let legacyScale = $state(false);

  const diff = $derived<SnapshotDiff | null>(
    snapshot === null ? null : diffSnapshot(snapshot, session.entries, { legacyScale }),
  );

  /** RF-35. Independe de haver snapshot: são as pendências da conta. */
  const unset = $derived(session.entries.filter((entry) => entry.priority === 0));

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;

    parseError = null;
    fileName = file.name;

    try {
      const text = await file.text();
      // Duas fontes de erro distintas — JSON inválido e formato inválido —, e as
      // duas precisam virar uma frase, nunca um crash (RF-31).
      snapshot = parseSnapshot(JSON.parse(text));
    } catch (cause) {
      snapshot = null;
      parseError =
        cause instanceof SyntaxError
          ? `Arquivo não é um JSON válido: ${cause.message}`
          : errorMessage(cause);
    } finally {
      // Permite reimportar o mesmo arquivo depois de corrigi-lo.
      input.value = '';
    }
  }

  function exportSnapshot(): void {
    downloadJson(`anilist-snapshot-${timestampSuffix()}.json`, toSnapshot(session.entries));
  }
</script>

<section class="screen">
  <header>
    <h2>Snapshot e diff</h2>
    <p class="sub">
      Compare a lista atual com um snapshot de referência. O <code>out.json</code> da versão antiga é
      entrada válida — marque a opção de escala antiga ao usá-lo.
    </p>
  </header>

  <div class="actions">
    <label class="file">
      <span>Importar snapshot JSON</span>
      <input type="file" accept="application/json,.json" onchange={(e) => void importFile(e)} />
    </label>

    <button
      type="button"
      class="ghost"
      onclick={exportSnapshot}
      disabled={session.entries.length === 0}
    >
      Exportar estado atual
    </button>

    <label class="legacy">
      <input type="checkbox" bind:checked={legacyScale} />
      Este snapshot está na escala antiga
    </label>
  </div>

  {#if fileName && !parseError}
    <p class="hint" role="status">Snapshot carregado: {fileName}</p>
  {/if}

  {#if parseError}
    <p class="alert" role="alert">{parseError}</p>
  {/if}

  {#if diff}
    <div class="counts" data-testid="resumo-diff">
      <p class="stat"><strong>{diff.matched}</strong> <span>iguais</span></p>
      <p class="stat"><strong>{diff.mismatched}</strong> <span>divergentes</span></p>
      <p class="stat"><strong>{diff.missing}</strong> <span>ausentes da conta</span></p>
    </div>

    <DiffGrid rows={diff.rows} />
  {/if}

  <section class="unset">
    <h3>Sem prioridade ({unset.length})</h3>
    {#if unset.length === 0}
      <p class="hint">Nenhuma pendência: toda entrada tem prioridade.</p>
    {:else}
      <ul>
        {#each unset as entry (entry.id)}
          <li>{entry.title}</li>
        {/each}
      </ul>
    {/if}
  </section>
</section>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    padding-bottom: 24px;
  }

  h2 {
    font-size: 1.05rem;
  }

  h3 {
    font-size: 0.9rem;
    margin-bottom: 6px;
  }

  .sub,
  .hint {
    color: var(--fg-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }

  code {
    background: var(--bg-elevated);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .file {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--fg-muted);
  }

  .file input {
    font-size: 0.8rem;
    color: var(--fg);
  }

  .legacy {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
    cursor: pointer;
  }

  button {
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: 6px;
    padding: 9px 14px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
  }

  .counts {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .stat {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 14px;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .stat strong {
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }

  .stat span {
    color: var(--fg-muted);
    font-size: 0.78rem;
  }

  .alert {
    background: #3d1d1d;
    border: 1px solid #7a2f2f;
    color: #ffb4b4;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
  }

  .unset ul {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .unset li {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.78rem;
  }
</style>
