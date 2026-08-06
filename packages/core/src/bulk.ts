/**
 * Aplicação em lote de um plano de conversão. Ver §5.7 de docs/REQUIREMENTS.md.
 *
 * Regra central (RF-25): **uma falha individual não aborta o lote.** O usuário
 * fica com o máximo de trabalho feito e um relatório explícito do que faltou.
 */

import type { AniListClient } from './client.js';
import { AniListError } from './errors.js';
import type { ConversionChange, ConversionPlan } from './priority.js';

export interface BulkFailure {
  readonly change: ConversionChange;
  readonly error: AniListError;
}

export interface BulkProgress {
  readonly done: number;
  readonly total: number;
  readonly current: ConversionChange | null;
  readonly failed: readonly BulkFailure[];
}

export interface BulkResult {
  readonly applied: readonly ConversionChange[];
  readonly failed: readonly BulkFailure[];
  /** `true` quando o `signal` foi abortado antes de percorrer tudo. */
  readonly aborted: boolean;
}

export interface ApplyOptions {
  /** Ver RF-24. O que já foi aplicado permanece aplicado. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: BulkProgress) => void;
}

/**
 * Garante que o que chega em `BulkFailure.error` é sempre um erro do domínio.
 *
 * A UI decide o que mostrar pelo TIPO do erro (ver errors.ts); um `TypeError`
 * cru vazando daqui quebraria essa promessa.
 */
function toAniListError(cause: unknown): AniListError {
  if (cause instanceof AniListError) return cause;
  const detalhe = cause instanceof Error ? cause.message : String(cause);
  return new AniListError(`Falha inesperada ao aplicar a conversão: ${detalhe}`, { cause });
}

/**
 * Ver RF-24 e RF-25. Percorre `plan.changes` em ordem, respeitando o throttle do
 * cliente. `plan.unchanged` e `plan.skipped` não geram escrita.
 *
 * `onProgress` é chamado antes de cada escrita (com `current` preenchido) e uma
 * última vez no fim (com `current: null`), para a barra fechar em 100%.
 */
export async function applyPlan(
  client: AniListClient,
  plan: ConversionPlan,
  options?: ApplyOptions,
): Promise<BulkResult> {
  const applied: ConversionChange[] = [];
  const failed: BulkFailure[] = [];
  const total = plan.changes.length;
  let aborted = false;

  const notificar = (current: ConversionChange | null): void => {
    options?.onProgress?.({
      done: applied.length + failed.length,
      total,
      current,
      // Cópia: o consumidor não pode enxergar a lista crescer por baixo dele.
      failed: [...failed],
    });
  };

  for (const change of plan.changes) {
    if (options?.signal?.aborted === true) {
      // RF-24: para aqui. O que já foi escrito no AniList permanece escrito.
      aborted = true;
      break;
    }

    notificar(change);

    try {
      await client.setPriority(change.id, change.to);
      applied.push(change);
    } catch (cause) {
      // RF-25: registra e segue. Só o relatório final decide o que fazer.
      failed.push({ change, error: toAniListError(cause) });
    }
  }

  notificar(null);

  return { applied, failed, aborted };
}
