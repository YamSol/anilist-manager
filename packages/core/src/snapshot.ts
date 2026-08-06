/**
 * Snapshot e diff. Ver §5.8 de docs/REQUIREMENTS.md.
 *
 * Sucessor do `/check` da v1, que lia um `out.json` de caminho fixo. Num app de
 * browser isso não existe, então o formato virou import/export explícito (AD-07).
 * O `out.json` legado continua sendo entrada válida — mas está na escala ANTIGA,
 * daí a opção `legacyScale` no diff (RF-34).
 */

import { notImplemented } from './internal/stub.js';
import type { AnimeEntry, Priority } from './model.js';

export interface SnapshotItem {
  readonly id: number;
  readonly name: string;
  readonly priority: Priority;
}

export type Snapshot = readonly SnapshotItem[];

/** Ver RF-30 e RF-31. Lança `SnapshotParseError` apontando o item inválido. */
export function parseSnapshot(_json: unknown): Snapshot {
  return notImplemented('parseSnapshot');
}

/** Ver RF-32. O resultado é reimportável por `parseSnapshot` sem perda. */
export function toSnapshot(_entries: readonly AnimeEntry[]): Snapshot {
  return notImplemented('toSnapshot');
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

/** Ver RF-33. */
export function diffSnapshot(
  _snapshot: Snapshot,
  _entries: readonly AnimeEntry[],
  _options?: DiffOptions,
): SnapshotDiff {
  return notImplemented('diffSnapshot');
}
