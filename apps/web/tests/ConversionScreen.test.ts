/**
 * Conversão de escala (RF-20 a RF-26).
 *
 * O que mais importa aqui é o que a tela **não** faz: abrir não escreve nada
 * (RF-21) e aplicar fica travado até o backup sair (RF-23).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type * as Core from '@anilist-updater/core';
import type { AniListClient, Priority } from '@anilist-updater/core';

vi.mock('@anilist-updater/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  const { makeFakeCore } = await import('./fakeCore.js');
  return { ...actual, ...makeFakeCore(actual) };
});

const ConversionScreen = (await import('../src/routes/ConversionScreen.svelte')).default;
const { SAMPLE_ENTRIES } = await import('../src/lib/fixtures.js');
const { createSession } = await import('../src/lib/session.svelte.js');
const { STORAGE_KEYS } = await import('../src/lib/storage.js');
const { markApplied } = await import('../src/lib/conversionGuard.js');

/** Cliente falso: registra as mutations em vez de emiti-las. */
function fakeClient() {
  const writes: { mediaId: number; priority: Priority }[] = [];
  // O spy é devolvido solto (e não lido de `client.setPriority`) para não
  // esbarrar em `@typescript-eslint/unbound-method` a cada asserção.
  const setPriority = vi.fn((mediaId: number, priority: Priority) => {
    writes.push({ mediaId, priority });
    return Promise.resolve();
  });
  const client = {
    setPriority,
    getViewerId: () => Promise.resolve(1),
    getAnimeList: () => Promise.resolve([...SAMPLE_ENTRIES]),
  } as unknown as AniListClient;
  return { client, writes, setPriority };
}

function setup() {
  const { client, writes, setPriority } = fakeClient();
  const session = createSession({ createClient: () => client });
  // A sessão nasce vazia; enchemos com o fixture, como um refresh faria.
  Object.defineProperty(session, 'entries', {
    get: () => SAMPLE_ENTRIES,
    configurable: true,
  });

  const view = render(ConversionScreen, { session, token: 'tok' });
  return { ...view, client, writes, setPriority, session };
}

/** Captura o Blob baixado sem tocar no sistema de arquivos. */
function stubDownload(): { calls: number } {
  const state = { calls: 0 };
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    state.calls += 1;
    return 'blob:fake';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ConversionScreen', () => {
  it('RF-22: as contagens separam alteradas, inalteradas e ignoradas', () => {
    setup();

    // Fixture: prioridades 1,2,3,5,0,4 → 4 invertem, o 3 fica, o 0 é ignorado.
    const counts = screen.getByText('alteradas').closest('.stat');
    expect(counts).toHaveTextContent('4');
    expect(screen.getByText('inalteradas').closest('.stat')).toHaveTextContent('1');
    expect(screen.getByText(/ignoradas/).closest('.stat')).toHaveTextContent('1');
    expect(screen.getByText('consideradas').closest('.stat')).toHaveTextContent('6');
  });

  it('RF-21: abrir a tela não emite nenhuma mutation', () => {
    const { setPriority } = setup();

    expect(setPriority).not.toHaveBeenCalled();
    // E o preview mostra cada mudança com origem e destino.
    const row = screen.getByText('Sword Art Online').closest('tr');
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('5');
  });

  it('RF-21: o preview lista só o que muda — o 3 e o 0 ficam de fora', () => {
    setup();

    expect(screen.queryByRole('cell', { name: 'Jujutsu Kaisen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Tower of God' })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Your Name.' })).toBeInTheDocument();
  });

  it('RF-23: aplicar fica desabilitado até exportar o backup', async () => {
    const user = userEvent.setup();
    const downloads = stubDownload();
    setup();

    const applyButton = screen.getByRole('button', { name: 'Aplicar no AniList' });
    expect(applyButton).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Exporte o backup/);

    await user.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));

    expect(downloads.calls).toBe(1);
    expect(applyButton).toBeEnabled();
  });

  it('RF-24: aplicar escreve só as mudanças e relata o resultado', async () => {
    const user = userEvent.setup();
    stubDownload();
    const { writes } = setup();

    await user.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));
    await user.click(screen.getByRole('button', { name: 'Aplicar no AniList' }));

    await waitFor(() => {
      expect(screen.getByTestId('relatorio')).toHaveTextContent('4 aplicadas, 0 com falha.');
    });
    // As inalteradas e as ignoradas não geram escrita.
    expect(writes).toHaveLength(4);
    expect(writes).toContainEqual({ mediaId: 11757, priority: 5 });
    expect(writes).toContainEqual({ mediaId: 21519, priority: 1 });
  });

  it('RF-26: com registro de conversão anterior, exibe o aviso e exige confirmação extra', async () => {
    const user = userEvent.setup();
    stubDownload();
    markApplied(Date.parse('2026-08-01T12:00:00Z'));
    setup();

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/já converteu neste dispositivo/);
    expect(banner).toHaveTextContent(/desfaz a conversão anterior/);

    // Nem exportar o backup basta: falta a confirmação extra.
    await user.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));
    expect(screen.getByRole('button', { name: 'Aplicar no AniList' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /reverter a conversão anterior/ }));
    expect(screen.getByRole('button', { name: 'Aplicar no AniList' })).toBeEnabled();
  });

  it('RF-26: sem registro anterior não há aviso de idempotência', () => {
    setup();

    expect(screen.queryByText(/já converteu neste dispositivo/)).not.toBeInTheDocument();
  });

  it('RF-26: aplicar grava o registro de conversão', async () => {
    const user = userEvent.setup();
    stubDownload();
    setup();

    expect(localStorage.getItem(STORAGE_KEYS.conversionAppliedAt)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));
    await user.click(screen.getByRole('button', { name: 'Aplicar no AniList' }));

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEYS.conversionAppliedAt)).not.toBeNull();
    });
  });

  it('RF-25: uma falha individual não aborta o lote e aparece no relatório', async () => {
    const user = userEvent.setup();
    stubDownload();
    const { setPriority } = setup();

    setPriority.mockImplementation((mediaId: number) =>
      mediaId === 21519 ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );

    await user.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));
    await user.click(screen.getByRole('button', { name: 'Aplicar no AniList' }));

    await waitFor(() => {
      expect(screen.getByTestId('relatorio')).toHaveTextContent('3 aplicadas, 1 com falha.');
    });
    expect(screen.getByText(/1.*com falha/)).toBeInTheDocument();
    expect(screen.getByText(/Your Name\./, { selector: 'li' })).toBeInTheDocument();
  });
});
