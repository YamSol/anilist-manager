/**
 * Implementação mínima do contrato de `packages/core` (docs/REQUIREMENTS.md §5),
 * só para os testes de componente desta branch.
 *
 * POR QUE EXISTE: nesta branch o core é um esqueleto cujas funções lançam
 * `notImplemented`. Um componente que chama `computeFacets` ou `planConversion`
 * não pode nem ser renderizado. Isto **não é** uma segunda implementação do
 * domínio: é um duplo de teste, deliberadamente ingênuo (sem paginação, sem
 * throttle, sem tratamento de rede), cujo único compromisso é obedecer às
 * assinaturas e à semântica descrita nos RFs.
 *
 * FASE 2: depois do merge de `feat/core`, este arquivo deve ser APAGADO e os
 * `vi.mock` que o usam removidos — os testes passam a rodar contra o core real.
 * Se algum teste falhar nesse momento, é sinal de que este duplo divergiu do
 * contrato, e o contrato é que vale.
 */

import type * as Core from '@anilist-updater/core';
import type {
  AnimeEntry,
  ConversionChange,
  ConversionPlan,
  DiffOptions,
  DiffRow,
  Facets,
  FilterState,
  ListStatus,
  MediaFormat,
  Priority,
  Snapshot,
  SnapshotDiff,
  SnapshotItem,
} from '@anilist-updater/core';

/** RF-14. Minúsculas e sem acentos. */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** RF-20. `nova = 6 - antiga` para 1..5; 0 permanece 0. */
function invertPriority(priority: Priority): Priority {
  return priority === 0 ? 0 : ((6 - priority) as Priority);
}

/** RF-17. Ascendente por urgência; 0 sempre por último, nas duas direções. */
function comparePriority(a: Priority, b: Priority): number {
  if (a === b) return 0;
  if (a === 0) return 1;
  if (b === 0) return -1;
  return a - b;
}

function isPriority(value: unknown): value is Priority {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
}

/** RF-13. AND entre facetas, OR dentro de cada faceta. */
function matchesFilter(entry: AnimeEntry, filter: FilterState): boolean {
  const text = filter.text.trim();
  if (text !== '' && !normalizeText(entry.title).includes(normalizeText(text))) return false;

  if (
    filter.formats.length > 0 &&
    (entry.format === null || !filter.formats.includes(entry.format))
  )
    return false;

  if (
    filter.statuses.length > 0 &&
    (entry.status === null || !filter.statuses.includes(entry.status))
  )
    return false;

  if (filter.priorities.length > 0 && !filter.priorities.includes(entry.priority)) return false;

  if (filter.genres.length > 0 && !filter.genres.some((genre) => entry.genres.includes(genre)))
    return false;

  if (filter.lists.length > 0 && !filter.lists.some((list) => entry.lists.includes(list)))
    return false;

  const score = entry.averageScore;
  if (filter.minScore !== null && (score === null || score < filter.minScore)) return false;
  if (filter.maxScore !== null && (score === null || score > filter.maxScore)) return false;

  return true;
}

function applyFilter(entries: readonly AnimeEntry[], filter: FilterState): AnimeEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filter));
}

function tally<T>(values: readonly T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }));
}

/** RF-15. Cada opção com a contagem de entradas que a possuem. */
function computeFacets(entries: readonly AnimeEntry[]): Facets {
  return {
    formats: tally(entries.map((e) => e.format).filter((f): f is MediaFormat => f !== null)).sort(
      (a, b) => a.value.localeCompare(b.value),
    ),
    statuses: tally(entries.map((e) => e.status).filter((s): s is ListStatus => s !== null)).sort(
      (a, b) => a.value.localeCompare(b.value),
    ),
    priorities: tally(entries.map((e) => e.priority)).sort((a, b) =>
      comparePriority(a.value, b.value),
    ),
    genres: tally(entries.flatMap((e) => [...e.genres])).sort((a, b) =>
      a.value.localeCompare(b.value),
    ),
    lists: tally(entries.flatMap((e) => [...e.lists])).sort((a, b) =>
      a.value.localeCompare(b.value),
    ),
  };
}

/** RF-21, RF-22. Puro: não escreve nada. */
function planConversion(entries: readonly AnimeEntry[]): ConversionPlan {
  const changes: ConversionChange[] = [];
  const unchanged: ConversionChange[] = [];
  const skipped: AnimeEntry[] = [];

  for (const entry of entries) {
    if (entry.priority === 0) {
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

/** RF-32. */
function toSnapshot(entries: readonly AnimeEntry[]): Snapshot {
  return entries.map((entry) => ({ id: entry.id, name: entry.title, priority: entry.priority }));
}

/** RF-30, RF-31. */
function makeParseSnapshot(actual: typeof Core) {
  return function parseSnapshot(json: unknown): Snapshot {
    if (!Array.isArray(json)) {
      throw new actual.SnapshotParseError('a raiz do arquivo precisa ser uma lista', 'raiz');
    }
    return json.map((raw, index) => {
      const at = `item ${String(index)}`;
      if (typeof raw !== 'object' || raw === null) {
        throw new actual.SnapshotParseError('item não é um objeto', at);
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== 'number') {
        throw new actual.SnapshotParseError('campo "id" ausente ou não numérico', at);
      }
      if (typeof item.name !== 'string') {
        throw new actual.SnapshotParseError('campo "name" ausente ou não textual', at);
      }
      if (!isPriority(item.priority)) {
        throw new actual.SnapshotParseError('campo "priority" fora de 0..5', at);
      }
      return { id: item.id, name: item.name, priority: item.priority } satisfies SnapshotItem;
    });
  };
}

/** RF-33, RF-34, RF-35. */
function diffSnapshot(
  snapshot: Snapshot,
  entries: readonly AnimeEntry[],
  options?: DiffOptions,
): SnapshotDiff {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows: DiffRow[] = snapshot.map((item) => {
    const expected = options?.legacyScale === true ? invertPriority(item.priority) : item.priority;
    const entry = byId.get(item.id);
    const actualValue = entry?.priority ?? null;
    return {
      id: item.id,
      name: item.name,
      expected,
      actual: actualValue,
      ok: actualValue !== null && actualValue === expected,
    };
  });

  return {
    rows,
    matched: rows.filter((row) => row.ok).length,
    mismatched: rows.filter((row) => !row.ok && row.actual !== null).length,
    missing: rows.filter((row) => row.actual === null).length,
    unset: entries.filter((entry) => entry.priority === 0),
  };
}

/** RF-24, RF-25. Uma falha individual não aborta o lote. */
function makeApplyPlan(actual: typeof Core) {
  return async function applyPlan(
    client: Core.AniListClient,
    plan: ConversionPlan,
    options?: Core.ApplyOptions,
  ): Promise<Core.BulkResult> {
    const applied: ConversionChange[] = [];
    const failed: Core.BulkFailure[] = [];
    let aborted = false;

    for (const change of plan.changes) {
      if (options?.signal?.aborted === true) {
        aborted = true;
        break;
      }
      options?.onProgress?.({
        done: applied.length + failed.length,
        total: plan.changes.length,
        current: change,
        failed,
      });
      try {
        await client.setPriority(change.id, change.to);
        applied.push(change);
      } catch (cause) {
        failed.push({
          change,
          error:
            cause instanceof actual.AniListError
              ? cause
              : new actual.AniListError(String(cause), { cause }),
        });
      }
    }

    options?.onProgress?.({
      done: applied.length + failed.length,
      total: plan.changes.length,
      current: null,
      failed,
    });

    return { applied, failed, aborted };
  };
}

/**
 * Devolve o conjunto de substituições para o `vi.mock`. Recebe o módulo real
 * para reaproveitar as classes de erro, que já estão implementadas no core.
 */
export function makeFakeCore(actual: typeof Core) {
  return {
    normalizeText,
    invertPriority,
    comparePriority,
    isPriority,
    matchesFilter,
    applyFilter,
    computeFacets,
    planConversion,
    toSnapshot,
    parseSnapshot: makeParseSnapshot(actual),
    diffSnapshot,
    applyPlan: makeApplyPlan(actual),
  };
}
