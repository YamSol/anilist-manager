/**
 * Semântica da escala de prioridade e a conversão da escala antiga para a nova.
 * Ver §5.2 de docs/REQUIREMENTS.md.
 *
 * ESCALA ANTIGA: 5 = máxima … 1 = mínima.
 * ESCALA NOVA:   1 = máxima … 5 = mínima.  (convencional, vigente)
 * Em ambas, 0 = sem prioridade.
 */

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

/**
 * Tabela da conversão `nova = 6 - antiga`, escrita por extenso.
 *
 * Tabular em vez de calcular evita o cast de `number` para `Priority` e deixa o
 * caso especial do 0 visível no mesmo lugar que os outros.
 */
const INVERTED_PRIORITY: Readonly<Record<Priority, Priority>> = Object.freeze({
  0: 0,
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
});

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
}

/** Ver RF-20. `nova = 6 - antiga` para 1..5; 0 permanece 0. */
export function invertPriority(priority: Priority): Priority {
  return INVERTED_PRIORITY[priority];
}

/**
 * Ver RF-17. Ordena por urgência crescente (1 primeiro) e joga 0 para o fim.
 *
 * ATENÇÃO a quem for inverter a ordenação: **negar o retorno não funciona.**
 * `-comparePriority(a, b)` levaria o 0 para o começo, e "sem prioridade" no topo
 * da lista é exatamente o que RF-17 proíbe. O 0 não participa da escala; ele é
 * um balde à parte que fica no fim nas duas direções.
 *
 * Para descendente, use `comparePriorityDesc`, que nega só o trecho 1..5.
 *
 * @example
 * [0, 3, 1, 5].sort(comparePriority);     // [1, 3, 5, 0]
 * [0, 3, 1, 5].sort(comparePriorityDesc); // [5, 3, 1, 0]
 */
export function comparePriority(a: Priority, b: Priority): number {
  if (a === b) return 0;
  if (a === PRIORITY_UNSET) return 1;
  if (b === PRIORITY_UNSET) return -1;
  return a - b;
}

/** Ver RF-17. Espelho descendente de `comparePriority`, com o 0 ainda por último. */
export function comparePriorityDesc(a: Priority, b: Priority): number {
  if (a === b) return 0;
  if (a === PRIORITY_UNSET) return 1;
  if (b === PRIORITY_UNSET) return -1;
  return b - a;
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
export function planConversion(entries: readonly AnimeEntry[]): ConversionPlan {
  const changes: ConversionChange[] = [];
  const unchanged: ConversionChange[] = [];
  const skipped: AnimeEntry[] = [];

  for (const entry of entries) {
    if (entry.priority === PRIORITY_UNSET) {
      // Sem prioridade não é ponto da escala: não há o que inverter.
      skipped.push(entry);
      continue;
    }

    const change: ConversionChange = {
      id: entry.id,
      title: entry.title,
      from: entry.priority,
      to: invertPriority(entry.priority),
    };

    if (change.from === change.to) unchanged.push(change);
    else changes.push(change);
  }

  return { changes, unchanged, skipped, total: entries.length };
}
