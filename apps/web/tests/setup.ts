import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

/**
 * O ag-grid observa o tamanho do próprio contêiner, e o jsdom não implementa
 * `ResizeObserver`. Sem este duplo, montar a grid lança. Como no jsdom nada tem
 * layout de verdade (tudo mede 0), observar de fato não traria informação —
 * o no-op é honesto.
 */
function ignore(): void {
  return undefined;
}

globalThis.ResizeObserver = class ResizeObserverStub {
  readonly observe = ignore;
  readonly unobserve = ignore;
  readonly disconnect = ignore;
};

/**
 * O jsdom também não implementa Object URLs, de que `lib/download.ts` depende
 * para exportar backup (RF-23) e snapshot (RF-32). Os testes espionam estes
 * stubs; sem eles, `vi.spyOn` falha com "createObjectURL does not exist".
 */
URL.createObjectURL = () => 'blob:stub';
URL.revokeObjectURL = ignore;

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Cada teste começa numa URL limpa: o roteador e o RF-03 leem `location.hash`.
  history.replaceState(null, '', '/');
});
