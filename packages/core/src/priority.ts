/**
 * Semântica da escala de prioridade e a conversão da escala antiga para a nova.
 * Ver §5.2 de docs/REQUIREMENTS.md.
 *
 * ESCALA ANTIGA: 5 = máxima … 1 = mínima.
 * ESCALA NOVA:   1 = máxima … 5 = mínima.  (convencional, vigente)
 * Em ambas, 0 = sem prioridade.
 */

import { notImplemented } from './internal/stub.js';
import type { AnimeEntry, Priority } from './model.js';

export const PRIORITY_UNSET = 0 satisfies Priority;
export const PRIORITY_HIGHEST = 1 satisfies Priority;
export const PRIORITY_LOWEST = 5 satisfies Priority;

/**
 * Paleta herdada da v1 (`app_anilist.py:187`), **invertida** para a escala nova:
 * agora é o 1 que recebe a cor mais quente.
 */
export const PRIORITY_COLORS: Readonly<Record<Priority, string>> = Object.freeze({
  0: '#555555',
  1: '#c0392b',
  2: '#d4601a',
  3: '#d4a017',
  4: '#2a9d4e',
  5: '#3a6bc7',
});

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = Object.freeze({
  0: 'Sem prioridade',
  1: 'Máxima',
  2: 'Alta',
  3: 'Média',
  4: 'Baixa',
  5: 'Mínima',
});

export const ALL_PRIORITIES: readonly Priority[] = Object.freeze([0, 1, 2, 3, 4, 5] as const);

export function isPriority(_value: unknown): _value is Priority {
  return notImplemented('isPriority');
}

/** Ver RF-20. `nova = 6 - antiga` para 1..5; 0 permanece 0. */
export function invertPriority(_priority: Priority): Priority {
  return notImplemented('invertPriority');
}

/**
 * Ver RF-17. Ordena por urgência crescente (1 primeiro) e joga 0 para o fim.
 * O 0 fica por último **nas duas direções** — quem inverte a ordenação deve
 * negar apenas o resultado do trecho 1..5, o que esta função já encapsula.
 */
export function comparePriority(_a: Priority, _b: Priority): number {
  return notImplemented('comparePriority');
}

export interface ConversionChange {
  readonly id: number;
  readonly title: string;
  readonly from: Priority;
  readonly to: Priority;
}

export interface ConversionPlan {
  /** `from !== to` — o que de fato será escrito. */
  readonly changes: readonly ConversionChange[];
  /** `from === to` e diferente de 0 — na prática, só a prioridade 3. */
  readonly unchanged: readonly ConversionChange[];
  /** `priority === 0` — fora da conversão. */
  readonly skipped: readonly AnimeEntry[];
  /** Total de entradas consideradas. */
  readonly total: number;
}

/**
 * Ver RF-21 e RF-22. Função pura: calcula, não escreve nada.
 *
 * ATENÇÃO: a conversão não é idempotente — aplicá-la duas vezes desfaz a
 * primeira. A guarda de idempotência é responsabilidade da UI (RF-26).
 */
export function planConversion(_entries: readonly AnimeEntry[]): ConversionPlan {
  return notImplemented('planConversion');
}
