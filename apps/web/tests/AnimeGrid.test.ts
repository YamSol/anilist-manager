/**
 * A grid da lista (RF-10, RF-11, RF-17, RF-18).
 *
 * O ag-grid roda de verdade sob jsdom — o que se verifica aqui é a fiação:
 * colunas certas, uma linha por anime, listas agregadas e o `PriorityPicker`
 * montado dentro da célula, escrevendo pelo callback recebido.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';
import type { AnimeEntry, Priority } from '@anilist-updater/core';

vi.mock('@anilist-updater/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  const { makeFakeCore } = await import('./fakeCore.js');
  return { ...actual, ...makeFakeCore(actual) };
});

const AnimeGrid = (await import('../src/components/AnimeGrid.svelte')).default;
const { SAMPLE_ENTRIES } = await import('../src/lib/fixtures.js');
const { buildColumnDefs } = await import('../src/lib/grid.js');

function setup(onpriority: (entry: AnimeEntry, priority: Priority) => Promise<void> = vi.fn()) {
  return render(AnimeGrid, { entries: SAMPLE_ENTRIES, onpriority });
}

describe('AnimeGrid', () => {
  it('RF-11: expõe as colunas que os filtros facetados exigem', () => {
    const headers = buildColumnDefs(null).map((col) => col.headerName);

    expect(headers).toEqual([
      '',
      'Nome',
      'Lista(s)',
      'Prioridade',
      'Formato',
      'Status',
      'Score',
      'Progresso',
      'Temporada',
    ]);
  });

  it('RF-17: a coluna de prioridade ordena pelo comparador do core', async () => {
    const { comparePriority } = await import('@anilist-updater/core');
    const priorityColumn = buildColumnDefs(null).find((col) => col.field === 'priority');
    const comparator = priorityColumn?.comparator;

    expect(comparator).toBeTypeOf('function');
    // O 0 vai para o fim, e é o core que diz isso.
    expect(comparator?.(0, 5, null as never, null as never, false)).toBe(comparePriority(0, 5));
    expect(comparator?.(1, 3, null as never, null as never, false)).toBe(comparePriority(1, 3));
  });

  it('RF-10: renderiza uma linha por anime, com as listas agregadas', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Sword Art Online')).toBeInTheDocument();
    });
    // Um anime em três listas continua sendo UMA linha.
    expect(screen.getAllByText('Sword Art Online')).toHaveLength(1);
    expect(screen.getByText('Assistindo, Favoritos, Rewatch')).toBeInTheDocument();
  });

  it('RF-11: mostra formato, status e temporada traduzidos para pt-BR', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Sword Art Online')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Assistindo').length).toBeGreaterThan(0);
    expect(screen.getByText('Verão 2012')).toBeInTheDocument();
    expect(screen.getByText('Filme')).toBeInTheDocument();
  });

  it('RF-18: o PriorityPicker da célula escreve pelo callback recebido', async () => {
    const user = userEvent.setup();
    const onpriority = vi
      .fn<(entry: AnimeEntry, priority: Priority) => Promise<void>>()
      .mockResolvedValue();
    setup(onpriority);

    // Uma célula de prioridade por linha, cada uma com os seis botões.
    await waitFor(() => {
      expect(screen.getAllByRole('group', { name: /^Prioridade de / })).toHaveLength(
        SAMPLE_ENTRIES.length,
      );
    });

    const saoCell = screen.getByRole('group', { name: 'Prioridade de Sword Art Online' });
    const lowest = [...saoCell.querySelectorAll('button')].at(-1);
    await user.click(lowest!);

    expect(onpriority).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 11757 }), 5);
  });
});
