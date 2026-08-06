/**
 * Filtro facetado (RF-13 a RF-16).
 *
 * O core é substituído pelo duplo de `fakeCore.ts` enquanto `feat/core` não
 * mergeia — ver o cabeçalho daquele arquivo.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';
import type { FilterState } from '@anilist-updater/core';

vi.mock('@anilist-updater/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  const { makeFakeCore } = await import('./fakeCore.js');
  return { ...actual, ...makeFakeCore(actual) };
});

const FilterBar = (await import('../src/components/FilterBar.svelte')).default;
const { SAMPLE_ENTRIES } = await import('../src/lib/fixtures.js');
const { applyFilter, EMPTY_FILTER } = await import('@anilist-updater/core');
const { loadFilter } = await import('../src/lib/filterStore.js');
const { STORAGE_KEYS } = await import('../src/lib/storage.js');

/**
 * A `FilterBar` é um componente controlado: recebe o `FilterState` e devolve o
 * próximo por `onchange`. Sem alguém segurando esse estado, dois cliques
 * seguidos partiriam ambos do filtro inicial e a segunda faceta apagaria a
 * primeira — que é justamente o que o teste de AND precisa exercitar.
 *
 * O papel de "quem segura o estado" (a tela de lista, na aplicação real) é feito
 * aqui à mão com `rerender`, porque runes só existem em `.svelte`/`.svelte.ts`.
 */
function setup(initial: FilterState = EMPTY_FILTER) {
  let filter = initial;
  const user = userEvent.setup();

  const view = render(FilterBar, {
    entries: SAMPLE_ENTRIES,
    filter,
    resultCount: applyFilter(SAMPLE_ENTRIES, filter).length,
    onchange: (next: FilterState) => {
      filter = next;
    },
  });

  function sync(): void {
    void view.rerender({
      entries: SAMPLE_ENTRIES,
      filter,
      resultCount: applyFilter(SAMPLE_ENTRIES, filter).length,
      onchange: (next: FilterState) => {
        filter = next;
      },
    });
  }

  return {
    ...view,
    /** Clica e devolve o estado ao componente, como a tela faria. */
    async click(element: Element): Promise<void> {
      await user.click(element);
      sync();
    },
    async type(element: Element, text: string): Promise<void> {
      await user.type(element, text);
      sync();
    },
    get filter(): FilterState {
      return filter;
    },
    get titles(): string[] {
      return applyFilter(SAMPLE_ENTRIES, filter).map((entry) => entry.title);
    },
  };
}

describe('FilterBar', () => {
  it('RF-15: cada faceta exibe a contagem de entradas em cada opção', () => {
    setup();

    // 4 dos 6 fixtures são TV; 1 é MOVIE; 1 é ONA.
    expect(screen.getByLabelText(/^TV/).closest('label')).toHaveTextContent('4');
    expect(screen.getByLabelText(/^Filme/).closest('label')).toHaveTextContent('1');
    // A faceta de gênero conta por ocorrência: 4 animes têm "Action".
    expect(screen.getByLabelText(/^Action/).closest('label')).toHaveTextContent('4');
    // "Favoritos" aparece em 2 animes (RF-10: um anime, várias listas).
    expect(screen.getByLabelText(/^Favoritos/).closest('label')).toHaveTextContent('2');
  });

  it('RF-13: duas facetas combinadas restringem com AND entre elas', async () => {
    const view = setup();

    await view.click(screen.getByLabelText(/^TV/));
    expect(view.titles).toEqual([
      'Sword Art Online',
      'Sousou no Frieren',
      'Jujutsu Kaisen',
      'Tokyo Ghoul',
    ]);

    // Segunda faceta: TV **e** prioridade 1.
    await view.click(screen.getByLabelText(/^1 /));
    expect(view.filter.formats).toEqual(['TV']);
    expect(view.titles).toEqual(['Sword Art Online']);
  });

  it('RF-13: dentro de uma mesma faceta os valores são OR', async () => {
    const view = setup();

    await view.click(screen.getByLabelText(/^1 /));
    await view.click(screen.getByLabelText(/^2 /));

    expect(view.titles).toEqual(['Sword Art Online', 'Sousou no Frieren']);
  });

  it('RF-14: a busca textual ignora maiúsculas e acentos', async () => {
    const view = setup();

    await view.type(screen.getByRole('searchbox'), 'FRIEREN');

    expect(view.titles).toEqual(['Sousou no Frieren']);
  });

  it('RF-13: a faixa de score restringe pelos limites informados', async () => {
    const view = setup();

    await view.type(screen.getByLabelText('Mínimo'), '85');

    expect(view.titles).toEqual(['Sousou no Frieren', 'Jujutsu Kaisen', 'Your Name.']);
  });

  it('RF-16: o estado dos filtros é persistido em localStorage', async () => {
    const view = setup();

    await view.click(screen.getByLabelText(/^TV/));
    await view.click(screen.getByLabelText(/^3 /));

    expect(localStorage.getItem(STORAGE_KEYS.filter)).not.toBeNull();
    // "Recarregar a página" = reler o storage do zero.
    const reloaded = loadFilter();
    expect(reloaded.formats).toEqual(['TV']);
    expect(reloaded.priorities).toEqual([3]);
  });

  it('RF-16: um filtro persistido volta marcado ao montar', () => {
    setup({ ...EMPTY_FILTER, formats: ['MOVIE'] });

    expect(screen.getByLabelText(/^Filme/)).toBeChecked();
    expect(screen.getByLabelText(/^TV/)).not.toBeChecked();
  });

  it('mostra quantos animes sobraram e limpa tudo num clique', async () => {
    const view = setup();

    expect(screen.getByRole('status')).toHaveTextContent('6 de 6 animes');
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeDisabled();

    await view.click(screen.getByLabelText(/^Filme/));
    expect(screen.getByRole('status')).toHaveTextContent('1 de 6 animes');

    await view.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(view.filter).toEqual(EMPTY_FILTER);
    expect(screen.getByRole('status')).toHaveTextContent('6 de 6 animes');
  });
});
