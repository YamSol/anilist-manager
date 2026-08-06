/**
 * Snapshot e diff. Ver §5.8 de docs/REQUIREMENTS.md.
 *
 * Sucessor do `/check` da v1, que lia um `out.json` de caminho fixo. Num app de
 * browser isso não existe, então o formato virou import/export explícito (AD-07).
 * O `out.json` legado continua sendo entrada válida — mas está na escala ANTIGA,
 * daí a opção `legacyScale` no diff (RF-34).
 */

import { SnapshotParseError } from './errors.js';
import type { AnimeEntry, Priority } from './model.js';
import { invertPriority, isPriority, PRIORITY_UNSET } from './priority.js';

export interface SnapshotItem {
  readonly id: number;
  readonly name: string;
  readonly priority: Priority;
}

export type Snapshot = readonly SnapshotItem[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ver RF-30 e RF-31. Lança `SnapshotParseError` apontando o item inválido.
 *
 * Aceita tanto o texto do arquivo quanto o valor já parseado: o seletor de
 * arquivo entrega texto, e o `JSON.parse` dele também precisa de erro legível.
 * O caminho do problema vem no formato `$[3].priority`.
 */
export function parseSnapshot(json: unknown): Snapshot {
  let root: unknown = json;

  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch (cause) {
      // A mensagem nativa do JSON.parse traz a posição do caractere ofensor;
      // é a informação mais útil que existe aqui, então ela é repassada.
      const detalhe = cause instanceof Error ? cause.message : String(cause);
      throw new SnapshotParseError(`O arquivo não é um JSON válido: ${detalhe}`, '$');
    }
  }

  if (!Array.isArray(root)) {
    throw new SnapshotParseError(
      'A raiz do snapshot precisa ser um array de {id, name, priority}.',
      '$',
    );
  }

  const items: SnapshotItem[] = [];

  for (const [index, raw] of (root as unknown[]).entries()) {
    const at = `$[${String(index)}]`;

    if (!isRecord(raw)) {
      throw new SnapshotParseError('Item do snapshot precisa ser um objeto.', at);
    }
    if (typeof raw.id !== 'number' || !Number.isInteger(raw.id)) {
      throw new SnapshotParseError('Campo "id" ausente ou não é um inteiro.', `${at}.id`);
    }
    if (typeof raw.name !== 'string') {
      throw new SnapshotParseError('Campo "name" ausente ou não é texto.', `${at}.name`);
    }
    if (!isPriority(raw.priority)) {
      throw new SnapshotParseError(
        'Campo "priority" precisa ser um inteiro de 0 a 5.',
        `${at}.priority`,
      );
    }

    // Reconstrói o item em vez de repassar o objeto cru: campo extra no arquivo
    // não vaza para dentro do domínio.
    items.push({ id: raw.id, name: raw.name, priority: raw.priority });
  }

  return items;
}

/** Ver RF-32. O resultado é reimportável por `parseSnapshot` sem perda. */
export function toSnapshot(entries: readonly AnimeEntry[]): Snapshot {
  return entries.map((entry) => ({ id: entry.id, name: entry.title, priority: entry.priority }));
}

export interface DiffRow {
  readonly id: number;
  readonly name: string;
  readonly expected: Priority;
  /** `null` quando o anime do snapshot não está mais na conta. */
  readonly actual: Priority | null;
  readonly ok: boolean;
}

export interface SnapshotDiff {
  readonly rows: readonly DiffRow[];
  readonly matched: number;
  readonly mismatched: number;
  readonly missing: number;
  /** Ver RF-35. Entradas da conta com prioridade 0. */
  readonly unset: readonly AnimeEntry[];
}

export interface DiffOptions {
  /** Ver RF-34. Inverte os valores do snapshot antes de comparar. */
  readonly legacyScale?: boolean;
}

/**
 * Ver RF-33.
 *
 * O snapshot manda na ordem e no nome das linhas — ele é a referência, e é dele
 * que o usuário se lembra. Anime que está na conta mas não no snapshot não vira
 * linha; o que interessa nesse sentido é `unset` (RF-35).
 */
export function diffSnapshot(
  snapshot: Snapshot,
  entries: readonly AnimeEntry[],
  options?: DiffOptions,
): SnapshotDiff {
  const legacyScale = options?.legacyScale ?? false;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  let matched = 0;
  let mismatched = 0;
  let missing = 0;

  const rows = snapshot.map((item): DiffRow => {
    // RF-34: o out.json legado está na escala antiga; inverter o esperado é o
    // que faz um snapshot pré-conversão bater com uma conta já convertida.
    const expected = legacyScale ? invertPriority(item.priority) : item.priority;
    const entry = byId.get(item.id);
    const actual = entry?.priority ?? null;
    const ok = actual !== null && actual === expected;

    if (actual === null) missing++;
    else if (ok) matched++;
    else mismatched++;

    return { id: item.id, name: item.name, expected, actual, ok };
  });

  return {
    rows,
    matched,
    mismatched,
    missing,
    unset: entries.filter((entry) => entry.priority === PRIORITY_UNSET),
  };
}
