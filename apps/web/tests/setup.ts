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

/**
 * `Blob.text()` também falta no jsdom, e é como a tela de snapshot lê o arquivo
 * escolhido (RF-30). `FileReader` existe lá, então serve de base. Nos navegadores
 * que o projeto suporta `Blob.text()` é nativo desde 2020 — não vale distorcer o
 * código de produção por causa desta lacuna.
 */
Blob.prototype.text = function text(this: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // `readAsText` sempre entrega string; o ArrayBuffer só vem de readAsArrayBuffer.
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('falha ao ler o arquivo'));
    };
    reader.readAsText(this);
  });
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Cada teste começa numa URL limpa: o roteador e o RF-03 leem `location.hash`.
  history.replaceState(null, '', '/');
});
