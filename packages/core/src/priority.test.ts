import { describe, expect, it } from 'vitest';

import type { AnimeEntry, Priority } from './model.js';
import {
  ALL_PRIORITIES,
  comparePriority,
  comparePriorityDesc,
  invertPriority,
  isPriority,
  planConversion,
  PRIORITY_COLORS,
  PRIORITY_HIGHEST,
  PRIORITY_LABELS,
  PRIORITY_LOWEST,
  PRIORITY_UNSET,
} from './priority.js';

function makeEntry(id: number, priority: Priority, title = `Anime ${String(id)}`): AnimeEntry {
  return {
    id,
    title,
    priority,
    lists: ['Assistindo'],
    status: 'CURRENT',
    format: 'TV',
    genres: [],
    averageScore: null,
    episodes: null,
    progress: 0,
    season: null,
    seasonYear: null,
    coverImage: null,
  };
}

describe('constantes da escala', () => {
  it('RF-20: as pontas da escala nova são 1 (máxima) e 5 (mínima), com 0 fora dela', () => {
    expect(PRIORITY_HIGHEST).toBe(1);
    expect(PRIORITY_LOWEST).toBe(5);
    expect(PRIORITY_UNSET).toBe(0);
  });

  it('RF-15: há cor e rótulo para as seis prioridades', () => {
    for (const p of ALL_PRIORITIES) {
      expect(PRIORITY_COLORS[p]).toMatch(/^#[0-9a-f]{6}$/);
      expect(PRIORITY_LABELS[p].length).toBeGreaterThan(0);
    }
  });
});

describe('isPriority', () => {
  it.each(ALL_PRIORITIES)('RF-20: aceita %i', (value) => {
    expect(isPriority(value)).toBe(true);
  });

  it.each([
    ['negativo', -1],
    ['acima da escala', 6],
    ['fracionário', 2.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['string numérica', '3'],
    ['null', null],
    ['undefined', undefined],
    ['objeto', {}],
  ])('RF-20: rejeita %s', (_nome, value) => {
    expect(isPriority(value)).toBe(false);
  });
});

describe('invertPriority', () => {
  it.each([
    [5, 1],
    [4, 2],
    [3, 3],
    [2, 4],
    [1, 5],
  ] as const)('RF-20: inverte %i para %i', (from, to) => {
    expect(invertPriority(from)).toBe(to);
  });

  it('RF-20: 0 permanece 0 — "sem prioridade" não é ponto da escala', () => {
    expect(invertPriority(0)).toBe(0);
  });

  it.each(ALL_PRIORITIES)('RF-20: inverter duas vezes volta ao original (%i)', (p) => {
    expect(invertPriority(invertPriority(p))).toBe(p);
  });

  it('RF-20: para 1..5 vale a fórmula 6 - antiga', () => {
    for (const p of [1, 2, 3, 4, 5] as const) {
      expect(invertPriority(p)).toBe(6 - p);
    }
  });
});

describe('comparePriority', () => {
  it('RF-17: ordena 1 antes de 2 antes de 5', () => {
    expect([5, 1, 3, 2, 4].sort(comparePriority)).toEqual([1, 2, 3, 4, 5]);
  });

  it('RF-17: ascendente joga 0 para o fim', () => {
    expect([0, 3, 1, 0, 5].sort(comparePriority)).toEqual([1, 3, 5, 0, 0]);
  });

  it('RF-17: descendente inverte 1..5 mas mantém 0 no fim', () => {
    expect([0, 3, 1, 5].sort(comparePriorityDesc)).toEqual([5, 3, 1, 0]);
  });

  it('RF-17: negar comparePriority NÃO serve para descender — é por isso que existe comparePriorityDesc', () => {
    const negado = [0, 3, 1, 5].sort((a, b) => -comparePriority(a, b));

    expect(negado[0]).toBe(0); // o 0 sobe para o topo, violando RF-17
    expect([0, 3, 1, 5].sort(comparePriorityDesc)[0]).toBe(5);
  });

  it('RF-17: prioridades iguais empatam nas duas direções', () => {
    expect(comparePriority(3, 3)).toBe(0);
    expect(comparePriority(0, 0)).toBe(0);
    expect(comparePriorityDesc(3, 3)).toBe(0);
    expect(comparePriorityDesc(0, 0)).toBe(0);
  });

  it('RF-17: 0 perde de qualquer prioridade real, em qualquer ordem de argumentos', () => {
    for (const p of [1, 2, 3, 4, 5] as const) {
      expect(comparePriority(0, p)).toBeGreaterThan(0);
      expect(comparePriority(p, 0)).toBeLessThan(0);
      expect(comparePriorityDesc(0, p)).toBeGreaterThan(0);
      expect(comparePriorityDesc(p, 0)).toBeLessThan(0);
    }
  });
});

describe('planConversion', () => {
  it('RF-22: [5,3,0] produz 1 alterada, 1 inalterada e 1 ignorada', () => {
    const plan = planConversion([makeEntry(1, 5), makeEntry(2, 3), makeEntry(3, 0)]);

    expect(plan.changes).toHaveLength(1);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.total).toBe(3);
  });

  it('RF-21: o preview traz origem e destino de cada mudança', () => {
    const plan = planConversion([makeEntry(11757, 1, 'Sword Art Online')]);

    expect(plan.changes[0]).toEqual({
      id: 11757,
      title: 'Sword Art Online',
      from: 1,
      to: 5,
    });
  });

  it('RF-22: só a prioridade 3 cai em unchanged', () => {
    const plan = planConversion(ALL_PRIORITIES.map((p, i) => makeEntry(i, p)));

    expect(plan.unchanged.map((c) => c.from)).toEqual([3]);
    expect(plan.changes.map((c) => c.from)).toEqual([1, 2, 4, 5]);
    expect(plan.skipped.map((e) => e.priority)).toEqual([0]);
  });

  it('RF-22: skipped carrega a entrada inteira, não só o id', () => {
    const entry = makeEntry(42, 0, 'Sem prioridade');
    const plan = planConversion([entry]);

    expect(plan.skipped[0]).toBe(entry);
  });

  it('RF-22: lista vazia produz plano vazio', () => {
    expect(planConversion([])).toEqual({ changes: [], unchanged: [], skipped: [], total: 0 });
  });

  it('RF-21: total conta todas as entradas consideradas, não só as alteradas', () => {
    const plan = planConversion([makeEntry(1, 0), makeEntry(2, 3), makeEntry(3, 4)]);

    expect(plan.total).toBe(3);
    expect(plan.changes).toHaveLength(1);
  });

  it('RF-21: é puro — a mesma entrada produz o mesmo plano e nada é mutado', () => {
    const entries = [makeEntry(1, 2), makeEntry(2, 0)];
    const antes = structuredClone(entries);

    planConversion(entries);
    planConversion(entries);

    expect(entries).toEqual(antes);
  });
});
