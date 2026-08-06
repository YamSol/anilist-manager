<script lang="ts">
  /**
   * Os seis botões redondos de prioridade. Ver RF-18 e RNF-09.
   *
   * Portado do `PrioCellRenderer` da v1 (`app_anilist.py:190-240`), que era
   * `innerHTML` + delegação de clique. A UX é a mesma — inclusive o ⏳/✓/✗ —, mas
   * agora são `<button>` de verdade: Tab alcança, Enter/Espaço ativam e as setas
   * andam entre eles, o que a versão antiga não oferecia.
   *
   * ATENÇÃO À ESCALA: `PRIORITY_COLORS` já vem invertida do core (1 = máxima =
   * cor mais quente). Nenhuma cor é redefinida aqui.
   */
  import {
    ALL_PRIORITIES,
    PRIORITY_COLORS,
    PRIORITY_LABELS,
    type Priority,
  } from '@anilist-updater/core';

  interface Props {
    value: Priority;
    /** Título do anime, só para compor rótulos acessíveis. */
    title?: string;
    /** Deve rejeitar em caso de falha — é assim que o ✗ aparece. */
    onchange: (priority: Priority) => Promise<void>;
  }

  const { value, title = '', onchange }: Props = $props();

  type Status = 'idle' | 'pending' | 'ok' | 'error';

  const FEEDBACK_MS = 1500;

  /**
   * Valor confirmado localmente após uma escrita bem-sucedida. Fica separado da
   * prop de propósito: numa falha ele não é tocado, então a célula continua
   * mostrando o valor real em vez de um otimismo que não aconteceu (RF-18).
   */
  let confirmed = $state<Priority | null>(null);
  let status = $state<Status>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const shown = $derived(confirmed ?? value);

  const STATUS_ICON: Readonly<Record<Status, string>> = {
    idle: '',
    pending: '⏳',
    ok: '✓',
    error: '✗',
  };

  const STATUS_TEXT: Readonly<Record<Status, string>> = {
    idle: '',
    pending: 'Salvando…',
    ok: 'Prioridade salva.',
    error: 'Falha ao salvar a prioridade.',
  };

  function fade(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      status = 'idle';
    }, FEEDBACK_MS);
  }

  async function select(priority: Priority): Promise<void> {
    if (status === 'pending') return;
    clearTimeout(timer);
    status = 'pending';
    try {
      await onchange(priority);
      confirmed = priority;
      status = 'ok';
    } catch {
      // O valor exibido permanece como estava — a escrita não aconteceu.
      status = 'error';
    }
    fade();
  }

  /**
   * RNF-09: setas andam entre os botões sem depender do mouse.
   *
   * O listener fica em cada botão, não no contêiner: um `<div role="group">` com
   * handler de teclado é justamente o que a regra a11y do Svelte reprova, e aqui
   * não há motivo para isso — o alvo natural do evento já é o botão focado.
   */
  function handleKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    const target = event.currentTarget as HTMLButtonElement;
    const siblings = [...(target.parentElement?.querySelectorAll('button') ?? [])];
    const index = siblings.indexOf(target);
    if (index === -1) return;

    event.preventDefault();
    siblings[(index + step + siblings.length) % siblings.length]?.focus();
  }

  $effect(() => () => {
    clearTimeout(timer);
  });
</script>

<div
  class="prio-cell"
  role="group"
  aria-label={title === '' ? 'Prioridade' : `Prioridade de ${title}`}
>
  {#each ALL_PRIORITIES as priority (priority)}
    <button
      type="button"
      class="prio-btn"
      class:active={priority === shown}
      class:zero={priority === 0}
      style="--c: {PRIORITY_COLORS[priority]}"
      aria-pressed={priority === shown}
      aria-label={PRIORITY_LABELS[priority]}
      disabled={status === 'pending'}
      onclick={() => void select(priority)}
      onkeydown={handleKeydown}
    >
      {priority}
    </button>
  {/each}

  <!-- `role=status` faz o leitor de tela anunciar ⏳/✓/✗ sem roubar o foco. -->
  <span class="status" role="status" aria-live="polite" title={STATUS_TEXT[status]}>
    {STATUS_ICON[status]}
    <span class="sr-only">{STATUS_TEXT[status]}</span>
  </span>
</div>

<style>
  .prio-cell {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .prio-btn {
    border: 2px solid var(--c);
    background: transparent;
    color: var(--c);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font:
      700 0.78rem/1 system-ui,
      sans-serif;
    padding: 0;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .prio-btn:hover:not(:disabled),
  .prio-btn.active {
    background: var(--c);
    color: #fff;
  }

  /* "Sem prioridade" é ausência de valor, não um valor: borda tracejada. */
  .prio-btn.zero {
    border-style: dashed;
  }

  .prio-btn:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .status {
    font-size: 0.8rem;
    margin-left: 4px;
    width: 16px;
    display: inline-block;
    flex-shrink: 0;
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
