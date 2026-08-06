/**
 * Aplicação em lote de um plano de conversão. Ver §5.7 de docs/REQUIREMENTS.md.
 *
 * Regra central (RF-25): **uma falha individual não aborta o lote.** O usuário
 * fica com o máximo de trabalho feito e um relatório explícito do que faltou.
 */

import { notImplemented } from './internal/stub.js';
import type { AniListClient } from './client.js';
import type { AniListError } from './errors.js';
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
 * Ver RF-24 e RF-25. Percorre `plan.changes` em ordem, respeitando o throttle do
 * cliente. `plan.unchanged` e `plan.skipped` não geram escrita.
 */
export function applyPlan(
  _client: AniListClient,
  _plan: ConversionPlan,
  _options?: ApplyOptions,
): Promise<BulkResult> {
  return notImplemented('applyPlan');
}
