import { describe, expect, it } from 'vitest';

import { SnapshotParseError } from './errors.js';
import type { AnimeEntry, Priority } from './model.js';
import { diffSnapshot, parseSnapshot, toSnapshot } from './snapshot.js';

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

/** Mesma forma do out.json legado: [{id, name, priority}] na escala antiga. */
const LEGADO = [
  { id: 11757, name: 'Sword Art Online', priority: 1 },
  { id: 115230, name: 'Tower of God', priority: 1 },
  { id: 140960, name: 'SPY x FAMILY', priority: 5 },
];

describe('parseSnapshot', () => {
  it('RF-30: importa o formato do out.json legado', () => {
    expect(parseSnapshot(LEGADO)).toEqual(LEGADO);
  });

  it('RF-30: aceita o texto do arquivo, não só o valor já parseado', () => {
    expect(parseSnapshot(JSON.stringify(LEGADO))).toEqual(LEGADO);
  });

  it('RF-30: array vazio é um snapshot válido', () => {
    expect(parseSnapshot([])).toEqual([]);
  });

  it('RF-30: aceita as seis prioridades, inclusive 0', () => {
    const todas = [0, 1, 2, 3, 4, 5].map((p, i) => ({ id: i, name: `A${String(i)}`, priority: p }));

    expect(parseSnapshot(todas)).toHaveLength(6);
  });

  it('RF-30: descarta campos extras em vez de deixá-los vazar para o domínio', () => {
    const comExtra = [{ id: 1, name: 'A', priority: 2, lixo: 'x', priorityOld: 4 }];

    expect(parseSnapshot(comExtra)).toEqual([{ id: 1, name: 'A', priority: 2 }]);
  });

  it('RF-31: JSON inválido vira SnapshotParseError apontando a raiz', () => {
    expect(() => parseSnapshot('{isso não é json}')).toThrow(SnapshotParseError);
    expect(() => parseSnapshot('{isso não é json}')).toThrow(/JSON válido/);
  });

  it.each([
    ['objeto', {}],
    ['número', 42],
    ['null', null],
    ['texto de um objeto JSON', '{"id":1}'],
  ])('RF-31: raiz que não é array (%s) aponta $', (_nome, entrada) => {
    expect(() => parseSnapshot(entrada)).toThrow(
      expect.objectContaining({ name: 'SnapshotParseError', at: '$' }),
    );
  });

  it('RF-31: item que não é objeto aponta o índice', () => {
    expect(() => parseSnapshot([{ id: 1, name: 'A', priority: 1 }, 'lixo'])).toThrow(
      expect.objectContaining({ at: '$[1]' }),
    );
  });

  it.each([
    ['ausente', { name: 'A', priority: 1 }],
    ['texto', { id: '1', name: 'A', priority: 1 }],
    ['fracionário', { id: 1.5, name: 'A', priority: 1 }],
    ['null', { id: null, name: 'A', priority: 1 }],
  ])('RF-31: id %s aponta $[0].id', (_nome, item) => {
    expect(() => parseSnapshot([item])).toThrow(expect.objectContaining({ at: '$[0].id' }));
  });

  it.each([
    ['ausente', { id: 1, priority: 1 }],
    ['número', { id: 1, name: 42, priority: 1 }],
    ['null', { id: 1, name: null, priority: 1 }],
  ])('RF-31: name %s aponta $[0].name', (_nome, item) => {
    expect(() => parseSnapshot([item])).toThrow(expect.objectContaining({ at: '$[0].name' }));
  });

  it.each([
    ['ausente', { id: 1, name: 'A' }],
    ['acima de 5', { id: 1, name: 'A', priority: 6 }],
    ['negativa', { id: 1, name: 'A', priority: -1 }],
    ['fracionária', { id: 1, name: 'A', priority: 2.5 }],
    ['texto', { id: 1, name: 'A', priority: '3' }],
  ])('RF-31: priority %s aponta $[0].priority', (_nome, item) => {
    expect(() => parseSnapshot([item])).toThrow(expect.objectContaining({ at: '$[0].priority' }));
  });

  it('RF-31: o índice apontado é o do primeiro item ruim, não o do último', () => {
    const dados = [
      { id: 1, name: 'A', priority: 1 },
      { id: 2, name: 'B', priority: 2 },
      { id: 3, name: 'C', priority: 9 },
      { id: 4, name: 'D', priority: 99 },
    ];

    expect(() => parseSnapshot(dados)).toThrow(expect.objectContaining({ at: '$[2].priority' }));
  });
});

describe('toSnapshot', () => {
  it('RF-32: exporta id, título e prioridade do estado vivo', () => {
    const snapshot = toSnapshot([makeEntry(1, 3, 'Bleach'), makeEntry(2, 0, 'Naruto')]);

    expect(snapshot).toEqual([
      { id: 1, name: 'Bleach', priority: 3 },
      { id: 2, name: 'Naruto', priority: 0 },
    ]);
  });

  it('RF-32: o exportado é reimportável sem perda', () => {
    const entries = [makeEntry(1, 5), makeEntry(2, 0), makeEntry(3, 3)];
    const exportado = toSnapshot(entries);

    expect(parseSnapshot(JSON.stringify(exportado))).toEqual(exportado);
  });

  it('RF-32: lista vazia exporta snapshot vazio', () => {
    expect(toSnapshot([])).toEqual([]);
  });
});

describe('diffSnapshot', () => {
  const snapshot = [
    { id: 1, name: 'Igual', priority: 2 },
    { id: 2, name: 'Divergente', priority: 4 },
    { id: 3, name: 'Sumiu da conta', priority: 1 },
  ] as const;

  const entries = [makeEntry(1, 2), makeEntry(2, 5), makeEntry(9, 0, 'Só na conta')];

  it('RF-33: classifica cada linha como igual, divergente ou ausente', () => {
    const diff = diffSnapshot(snapshot, entries);

    expect(diff.rows).toEqual([
      { id: 1, name: 'Igual', expected: 2, actual: 2, ok: true },
      { id: 2, name: 'Divergente', expected: 4, actual: 5, ok: false },
      { id: 3, name: 'Sumiu da conta', expected: 1, actual: null, ok: false },
    ]);
  });

  it('RF-33: o resumo traz as contagens de matched, mismatched e missing', () => {
    const diff = diffSnapshot(snapshot, entries);

    expect(diff.matched).toBe(1);
    expect(diff.mismatched).toBe(1);
    expect(diff.missing).toBe(1);
  });

  it('RF-33: só o snapshot gera linhas; anime que só existe na conta não vira linha', () => {
    expect(diffSnapshot(snapshot, entries).rows.map((r) => r.id)).not.toContain(9);
  });

  it('RF-35: unset lista as entradas da conta com prioridade 0', () => {
    const diff = diffSnapshot(snapshot, entries);

    expect(diff.unset.map((e) => e.title)).toEqual(['Só na conta']);
  });

  it('RF-35: unset independe do snapshot — vale até com snapshot vazio', () => {
    const diff = diffSnapshot([], [makeEntry(1, 0), makeEntry(2, 3), makeEntry(3, 0)]);

    expect(diff.rows).toEqual([]);
    expect(diff.unset.map((e) => e.id)).toEqual([1, 3]);
  });

  it('RF-34: sem legacyScale, um snapshot antigo diverge da conta convertida', () => {
    const antigo = [{ id: 1, name: 'A', priority: 5 }];
    const convertida = [makeEntry(1, 1)];

    const diff = diffSnapshot(antigo, convertida);

    expect(diff.mismatched).toBe(1);
    expect(diff.matched).toBe(0);
  });

  it('RF-34: com legacyScale, o mesmo par resulta em zero divergências', () => {
    const antigo = [
      { id: 1, name: 'A', priority: 5 },
      { id: 2, name: 'B', priority: 3 },
      { id: 3, name: 'C', priority: 1 },
      { id: 4, name: 'D', priority: 0 },
    ];
    const convertida = [makeEntry(1, 1), makeEntry(2, 3), makeEntry(3, 5), makeEntry(4, 0)];

    const diff = diffSnapshot(antigo, convertida, { legacyScale: true });

    expect(diff.mismatched).toBe(0);
    expect(diff.missing).toBe(0);
    expect(diff.matched).toBe(4);
  });

  it('RF-34: legacyScale mostra o valor já convertido na coluna esperada', () => {
    const diff = diffSnapshot([{ id: 1, name: 'A', priority: 5 }], [makeEntry(1, 1)], {
      legacyScale: true,
    });

    expect(diff.rows[0]?.expected).toBe(1);
  });

  it('RF-34: legacyScale: false é o mesmo que omitir a opção', () => {
    expect(diffSnapshot(snapshot, entries, { legacyScale: false })).toEqual(
      diffSnapshot(snapshot, entries),
    );
  });

  it('RF-33: snapshot e conta vazios produzem um diff zerado', () => {
    expect(diffSnapshot([], [])).toEqual({
      rows: [],
      matched: 0,
      mismatched: 0,
      missing: 0,
      unset: [],
    });
  });

  it('RF-33: prioridade 0 na conta bate com 0 esperado, sem virar divergência', () => {
    const diff = diffSnapshot([{ id: 1, name: 'A', priority: 0 }], [makeEntry(1, 0)]);

    expect(diff.matched).toBe(1);
    expect(diff.rows[0]?.actual).toBe(0);
  });
});
