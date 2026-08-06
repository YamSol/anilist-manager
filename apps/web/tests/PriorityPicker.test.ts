/**
 * Os botões redondos de prioridade. RF-18 (feedback de progresso/sucesso/erro)
 * e RNF-09 (operável só pelo teclado).
 *
 * O componente só consome constantes do core (`ALL_PRIORITIES`, `PRIORITY_COLORS`,
 * `PRIORITY_LABELS`), que já são valores reais mesmo na fase de stub — nada a mockar.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PriorityPicker from '../src/components/PriorityPicker.svelte';

function buttons(): HTMLButtonElement[] {
  return screen.getAllByRole('button');
}

describe('PriorityPicker', () => {
  it('RF-18: mostra os seis níveis e marca o valor atual', () => {
    render(PriorityPicker, { value: 3, title: 'Jujutsu Kaisen', onchange: vi.fn() });

    expect(buttons()).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Média' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Máxima' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('RF-18: clicar dispara a escrita e passa a refletir o novo valor', async () => {
    const user = userEvent.setup();
    const onchange = vi.fn<(p: 0 | 1 | 2 | 3 | 4 | 5) => Promise<void>>().mockResolvedValue();
    render(PriorityPicker, { value: 3, title: 'Jujutsu Kaisen', onchange });

    await user.click(screen.getByRole('button', { name: 'Máxima' }));

    expect(onchange).toHaveBeenCalledExactlyOnceWith(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Máxima' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getByRole('button', { name: 'Média' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('✓');
  });

  it('RF-18: enquanto a escrita está pendente, exibe ⏳', async () => {
    const user = userEvent.setup();
    let resolve = (): void => undefined;
    const onchange = vi.fn(async () => {
      await new Promise<void>((r) => {
        resolve = r;
      });
    });
    render(PriorityPicker, { value: 3, onchange });

    await user.click(screen.getByRole('button', { name: 'Mínima' }));

    expect(screen.getByRole('status')).toHaveTextContent('⏳');
    resolve();
  });

  it('RF-18: um erro mostra ✗ e NÃO corrompe o valor exibido', async () => {
    const user = userEvent.setup();
    const onchange = vi.fn().mockRejectedValue(new Error('401'));
    render(PriorityPicker, { value: 3, title: 'Jujutsu Kaisen', onchange });

    await user.click(screen.getByRole('button', { name: 'Máxima' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('✗');
    });
    // A escrita falhou: a célula continua mostrando o valor real.
    expect(screen.getByRole('button', { name: 'Média' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Máxima' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('RNF-09: dá para chegar aos botões e ativá-los só com o teclado', async () => {
    const user = userEvent.setup();
    const onchange = vi.fn<(p: 0 | 1 | 2 | 3 | 4 | 5) => Promise<void>>().mockResolvedValue();
    render(PriorityPicker, { value: 0, onchange });

    // Tab alcança o primeiro botão porque são <button> de verdade.
    await user.tab();
    expect(document.activeElement).toBe(buttons()[0]);

    // Enter ativa o botão focado, sem mouse.
    await user.keyboard('{Enter}');
    expect(onchange).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('RNF-09: as setas movem o foco entre os botões', async () => {
    const user = userEvent.setup();
    render(PriorityPicker, { value: 0, onchange: vi.fn() });

    await user.tab();
    expect(document.activeElement).toBe(buttons()[0]);

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(buttons()[2]);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(buttons()[1]);

    // Circular: da primeira posição, ArrowLeft vai para a última.
    buttons()[0]?.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(buttons()[5]);
  });

  it('RNF-09: cada botão tem rótulo acessível e o grupo identifica o anime', () => {
    render(PriorityPicker, { value: 1, title: 'Frieren', onchange: vi.fn() });

    expect(screen.getByRole('group', { name: 'Prioridade de Frieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sem prioridade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Máxima' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mínima' })).toBeInTheDocument();
  });
});
