/**
 * Guarda de idempotência da conversão de escala (RF-26).
 *
 * A conversão `nova = 6 - antiga` é uma involução: aplicá-la duas vezes **desfaz**
 * a primeira (AD-09). O core avisa disso no JSDoc de `planConversion` e delega
 * explicitamente a guarda à UI, que é quem tem memória entre sessões.
 *
 * O registro é local ao dispositivo. Converter de outro navegador não é detectado —
 * é limitação conhecida de um app sem backend (RNF-01), e por isso o backup JSON
 * (RF-23) continua sendo obrigatório mesmo sem registro anterior.
 */

import { STORAGE_KEYS, readRaw, removeRaw, writeRaw } from './storage.js';

/** Epoch ms da última conversão aplicada neste dispositivo, ou `null`. */
export function loadAppliedAt(): number | null {
  const raw = readRaw(STORAGE_KEYS.conversionAppliedAt);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function markApplied(now: number = Date.now()): void {
  writeRaw(STORAGE_KEYS.conversionAppliedAt, String(now));
}

/** Só para o usuário que sabe o que está fazendo (ou para os testes). */
export function clearApplied(): void {
  removeRaw(STORAGE_KEYS.conversionAppliedAt);
}

export function formatAppliedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR');
}
