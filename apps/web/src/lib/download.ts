/**
 * Download de arquivo gerado no cliente, via Blob + `<a download>`.
 *
 * Não há backend (RNF-01): exportar backup (RF-23) e snapshot (RF-32) é
 * necessariamente uma operação de browser.
 */

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revogar de imediato quebra o download em alguns navegadores; um tick basta.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/** Sufixo estável e ordenável para nomes de arquivo: `2026-08-06T13-45-02`. */
export function timestampSuffix(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 19).replaceAll(':', '-');
}
