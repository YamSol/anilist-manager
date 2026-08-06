/**
 * Ponte entre o ag-grid (JS puro) e o `PriorityPicker` (Svelte).
 *
 * O ag-grid community não tem integração com Svelte, então o cell renderer é a
 * classe `ICellRendererComp` que ele espera — mas em vez de montar `innerHTML`
 * como a v1 fazia (`app_anilist.py:190-240`), ela monta o componente Svelte e
 * repassa os dados por props reativas.
 *
 * `refresh` devolve `true` de propósito: remontar a cada mudança apagaria o
 * ✓/✗ que o picker acabou de mostrar.
 */

import { mount, unmount } from 'svelte';
import type { ICellRendererComp, ICellRendererParams } from 'ag-grid-community';
import type { AnimeEntry, Priority } from '@anilist-updater/core';
import PriorityPicker from '../components/PriorityPicker.svelte';

export type PriorityWriter = (entry: AnimeEntry, priority: Priority) => Promise<void>;

interface PickerProps {
  value: Priority;
  title: string;
  onchange: (priority: Priority) => Promise<void>;
}

/**
 * Cria a classe do renderer já ligada ao gravador de prioridade. A escrita vem
 * de fora porque este módulo não conhece rede nem sessão.
 */
export function createPriorityCellRenderer(
  write: PriorityWriter,
): new () => ICellRendererComp<AnimeEntry> {
  return class PriorityCellRenderer implements ICellRendererComp<AnimeEntry> {
    private gui = document.createElement('div');
    private props: PickerProps | undefined;
    private instance: Record<string, unknown> | undefined;

    init(params: ICellRendererParams<AnimeEntry, Priority>): void {
      const entry = params.data;
      if (entry === undefined) return;

      const props: PickerProps = $state({
        value: entry.priority,
        title: entry.title,
        onchange: (priority: Priority) => write(entry, priority),
      });
      this.props = props;
      this.instance = mount(PriorityPicker, { target: this.gui, props }) as Record<string, unknown>;
    }

    getGui(): HTMLElement {
      return this.gui;
    }

    refresh(params: ICellRendererParams<AnimeEntry, Priority>): boolean {
      if (this.props === undefined || params.data === undefined) return false;
      this.props.value = params.data.priority;
      this.props.title = params.data.title;
      return true;
    }

    destroy(): void {
      if (this.instance !== undefined) {
        void unmount(this.instance);
        this.instance = undefined;
      }
    }
  };
}
