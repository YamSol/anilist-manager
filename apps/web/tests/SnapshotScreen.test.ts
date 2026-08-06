/**
 * Snapshot e diff (RF-30 a RF-35).
 *
 * O ponto crítico é RF-31: arquivo ruim vira mensagem, nunca crash — e há dois
 * modos de "ruim" (JSON inválido e formato inválido) que precisam dos dois
 * caminhos de tratamento.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
const SnapshotScreen = (await import('../src/routes/SnapshotScreen.svelte')).default;
const { SAMPLE_ENTRIES } = await import('../src/lib/fixtures.js');
const { createSession } = await import('../src/lib/session.svelte.js');

function setup() {
  const session = createSession({ createClient: () => ({}) as never });
  Object.defineProperty(session, 'entries', {
    get: () => SAMPLE_ENTRIES,
    configurable: true,
  });
  return render(SnapshotScreen, { session });
}

function jsonFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/json' });
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Importar snapshot JSON');
}

/** Snapshot na escala NOVA que bate exatamente com o fixture. */
const MATCHING = JSON.stringify([
  { id: 11757, name: 'Sword Art Online', priority: 1 },
  { id: 154587, name: 'Sousou no Frieren', priority: 2 },
]);

describe('SnapshotScreen', () => {
  it('RF-30: importar um snapshot válido produz o diff', async () => {
    const user = userEvent.setup();
    setup();

    await user.upload(fileInput(), jsonFile('out.json', MATCHING));

    await waitFor(() => {
      expect(screen.getByTestId('resumo-diff')).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Snapshot carregado: out.json');
  });

  it('RF-33: o resumo traz matched, mismatched e missing', async () => {
    const user = userEvent.setup();
    setup();

    const snapshot = JSON.stringify([
      { id: 11757, name: 'Sword Art Online', priority: 1 }, // igual
      { id: 154587, name: 'Sousou no Frieren', priority: 4 }, // divergente
      { id: 999999, name: 'Some Anime', priority: 2 }, // ausente da conta
    ]);
    await user.upload(fileInput(), jsonFile('snap.json', snapshot));

    await waitFor(() => {
      expect(screen.getByText('iguais').closest('.stat')).toHaveTextContent('1');
    });
    expect(screen.getByText('divergentes').closest('.stat')).toHaveTextContent('1');
    expect(screen.getByText(/ausentes da conta/).closest('.stat')).toHaveTextContent('1');
  });

  it('RF-34: marcar "escala antiga" inverte os valores do snapshot na comparação', async () => {
    const user = userEvent.setup();
    setup();

    // Mesmos animes, mas na escala ANTIGA: 5 vira 1, 4 vira 2.
    const legacy = JSON.stringify([
      { id: 11757, name: 'Sword Art Online', priority: 5 },
      { id: 154587, name: 'Sousou no Frieren', priority: 4 },
    ]);
    await user.upload(fileInput(), jsonFile('out.json', legacy));

    // Sem a flag, os dois divergem da conta já convertida.
    await waitFor(() => {
      expect(screen.getByText('divergentes').closest('.stat')).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('checkbox', { name: /escala antiga/ }));

    // Com a flag, zero divergências.
    expect(screen.getByText('iguais').closest('.stat')).toHaveTextContent('2');
    expect(screen.getByText('divergentes').closest('.stat')).toHaveTextContent('0');
  });

  it('RF-31: JSON malformado vira mensagem legível, não crash', async () => {
    const user = userEvent.setup();
    setup();

    await user.upload(fileInput(), jsonFile('ruim.json', '{ isso não é json'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/não é um JSON válido/);
    });
    expect(screen.queryByTestId('resumo-diff')).not.toBeInTheDocument();
  });

  it('RF-31: JSON válido com formato errado aponta o item problemático', async () => {
    const user = userEvent.setup();
    setup();

    const bad = JSON.stringify([
      { id: 1, name: 'ok', priority: 1 },
      { id: 2, name: 'sem prioridade válida', priority: 9 },
    ]);
    await user.upload(fileInput(), jsonFile('ruim.json', bad));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Snapshot inválido/);
    });
    // RF-31 exige apontar QUAL item está errado, não só que algo está.
    expect(screen.getByRole('alert')).toHaveTextContent(/\$\[1\]\.priority/);
    expect(screen.getByRole('alert')).toHaveTextContent(/inteiro de 0 a 5/);
  });

  it('RF-31: raiz que não é lista também é recusada com mensagem', async () => {
    const user = userEvent.setup();
    setup();

    await user.upload(fileInput(), jsonFile('ruim.json', '{"nao":"e uma lista"}'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/raiz do snapshot precisa ser um array/);
    });
  });

  it('RF-32: exportar o estado atual baixa um JSON', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    setup();

    await user.click(screen.getByRole('button', { name: 'Exportar estado atual' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    createObjectURL.mockRestore();
  });

  it('RF-35: lista as entradas sem prioridade, com a contagem', () => {
    setup();

    // Só "Tower of God" está com prioridade 0 no fixture.
    expect(screen.getByRole('heading', { name: 'Sem prioridade (1)' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Tower of God');
  });
});
