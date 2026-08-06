<script lang="ts">
  /**
   * Conversão da escala antiga para a nova. Escopo C, RF-20 a RF-26.
   *
   * A operação é destrutiva e quase irreversível (AD-09): reaplicar não desfaz,
   * **re-inverte**. Por isso a tela tem três travas, nesta ordem:
   *   1. preview obrigatório, sem nenhuma escrita ao abrir (RF-21);
   *   2. backup exportado nesta sessão antes de habilitar o aplicar (RF-23);
   *   3. confirmação extra se já houve uma conversão neste dispositivo (RF-26).
   *
   * Nada de aritmética de escala aqui: `planConversion` calcula e `applyPlan`
   * aplica. Se aparecer um `6 - x` neste arquivo, está errado.
   */
  import {
    applyPlan,
    planConversion,
    toSnapshot,
    type BulkProgress,
    type BulkResult,
  } from '@anilist-updater/core';
  import { downloadJson, timestampSuffix } from '../lib/download.js';
  import { formatAppliedAt, loadAppliedAt, markApplied } from '../lib/conversionGuard.js';
  import { errorMessage } from '../lib/labels.js';
  import type { Session } from '../lib/session.svelte.js';

  interface Props {
    session: Session;
    token: string;
  }

  const { session, token }: Props = $props();

  // RF-21: puro cálculo. Abrir esta tela não emite nenhuma mutation.
  const plan = $derived(planConversion(session.entries));

  /** RF-23. Vale por sessão: recarregar a página exige exportar de novo. */
  let backupExported = $state(false);
  /** RF-26. Registro de uma conversão anterior neste dispositivo. */
  let appliedAt = $state<number | null>(loadAppliedAt());
  let reapplyConfirmed = $state(false);

  let running = $state(false);
  let progress = $state<BulkProgress | null>(null);
  let result = $state<BulkResult | null>(null);
  let failure = $state<string | null>(null);
  let controller: AbortController | null = null;

  const needsReapplyConfirmation = $derived(appliedAt !== null);
  const canApply = $derived(
    backupExported &&
      plan.changes.length > 0 &&
      !running &&
      (!needsReapplyConfirmation || reapplyConfirmed),
  );

  /**
   * Uma frase só, num único nó de texto: um leitor de tela lê o `role=status`
   * de uma vez, e o teste não precisa remontar o texto de vários elementos.
   */
  const summary = $derived(
    result === null
      ? ''
      : `${String(result.applied.length)} aplicadas, ${String(result.failed.length)} com falha` +
          (result.aborted ? ' — cancelado no meio.' : '.'),
  );

  function exportBackup(): void {
    // RF-23: o backup é o estado ATUAL, antes da conversão — o único caminho de volta.
    downloadJson(`anilist-backup-${timestampSuffix()}.json`, toSnapshot(session.entries));
    backupExported = true;
  }

  async function apply(): Promise<void> {
    running = true;
    failure = null;
    result = null;
    controller = new AbortController();

    try {
      const outcome = await applyPlan(session.client(token), plan, {
        signal: controller.signal,
        onProgress: (value) => {
          progress = value;
        },
      });
      result = outcome;
      if (outcome.applied.length > 0) {
        // RF-26: registra para que uma segunda passada exija confirmação extra.
        markApplied();
        appliedAt = loadAppliedAt();
      }
      // A lista em memória ficou defasada: recarrega do AniList.
      await session.refresh(token);
    } catch (cause) {
      failure = errorMessage(cause);
    } finally {
      running = false;
      controller = null;
    }
  }

  function cancel(): void {
    controller?.abort();
  }
</script>

<section class="screen">
  <header>
    <h2>Converter a escala de prioridade</h2>
    <p class="sub">
      A escala antiga tinha <strong>5 como máxima</strong>; a nova tem
      <strong>1 como máxima</strong>. A conversão inverte os valores de 1 a 5 e deixa o 0 intacto.
    </p>
  </header>

  {#if needsReapplyConfirmation}
    <!-- RF-26: a conversão é uma involução — aplicar de novo desfaz a anterior. -->
    <div class="banner" role="alert">
      <strong>Você já converteu neste dispositivo em {formatAppliedAt(appliedAt ?? 0)}.</strong>
      <p>
        Converter de novo <em>não</em> avança nada: ela desfaz a conversão anterior, devolvendo tudo à
        escala antiga. Só continue se for exatamente isso que você quer.
      </p>
      <label>
        <input type="checkbox" bind:checked={reapplyConfirmed} />
        Entendi que isto vai reverter a conversão anterior
      </label>
    </div>
  {/if}

  <div class="counts">
    <p class="stat"><strong>{plan.changes.length}</strong> <span>alteradas</span></p>
    <p class="stat"><strong>{plan.unchanged.length}</strong> <span>inalteradas</span></p>
    <p class="stat"><strong>{plan.skipped.length}</strong> <span>ignoradas (prioridade 0)</span></p>
    <p class="stat"><strong>{plan.total}</strong> <span>consideradas</span></p>
  </div>

  <div class="actions">
    <button type="button" class="ghost" onclick={exportBackup} disabled={plan.total === 0}>
      Exportar backup JSON
    </button>

    <button type="button" class="primary" onclick={() => void apply()} disabled={!canApply}>
      Aplicar no AniList
    </button>

    {#if running}
      <button type="button" class="ghost" onclick={cancel}>Cancelar</button>
    {/if}

    {#if !backupExported}
      <p class="hint" role="status">
        Exporte o backup para liberar o botão de aplicar — é o único jeito de desfazer.
      </p>
    {/if}
  </div>

  {#if running && progress}
    <div class="progress">
      <progress max={progress.total} value={progress.done}></progress>
      <span>{progress.done} de {progress.total}</span>
    </div>
  {/if}

  {#if failure}
    <p class="alert" role="alert">{failure}</p>
  {/if}

  {#if result}
    <div class="report" role="status" data-testid="relatorio">
      <p class="summary">{summary}</p>
      {#if result.failed.length > 0}
        <ul class="failures">
          {#each result.failed as item (item.change.id)}
            <li>{item.change.title}: {errorMessage(item.error)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <h3>Prévia — antes → depois</h3>
  {#if plan.changes.length === 0}
    <p class="hint">Nada a converter.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Anime</th>
            <th scope="col">Antes</th>
            <th scope="col">Depois</th>
          </tr>
        </thead>
        <tbody>
          {#each plan.changes as change (change.id)}
            <tr>
              <td>{change.title}</td>
              <td class="num">{change.from}</td>
              <td class="num">{change.to}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
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
    margin-top: 4px;
  }

  .sub,
  .hint {
    color: var(--fg-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .banner {
    background: #3a2d10;
    border: 1px solid #7a5f1f;
    color: #ffdf9e;
    border-radius: 6px;
    padding: 12px 14px;
    font-size: 0.82rem;
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.5;
  }

  .banner label {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
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

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
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

  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--fg-muted);
  }

  progress {
    flex: 1;
    max-width: 320px;
    height: 8px;
  }

  .alert {
    background: #3d1d1d;
    border: 1px solid #7a2f2f;
    color: #ffb4b4;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
  }

  .report {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.82rem;
  }

  .failures {
    margin: 8px 0 0 18px;
    color: #ffb4b4;
    line-height: 1.6;
  }

  .table-wrap {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: auto;
    max-height: 46vh;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th,
  td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }

  th {
    position: sticky;
    top: 0;
    background: var(--bg-elevated);
    color: var(--fg-muted);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .num {
    font-variant-numeric: tabular-nums;
    width: 70px;
  }
</style>
