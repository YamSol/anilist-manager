/**
 * Acesso a `localStorage` com tolerância a falha.
 *
 * O core não pode tocar em storage (RNF-03), então toda persistência mora aqui,
 * na camada web. Navegador em modo privado ou com storage bloqueado lança em
 * `localStorage` — nenhuma dessas exceções pode derrubar a aplicação, então
 * tudo aqui degrada para "sem persistência" em silêncio.
 */

/** Chaves persistidas. Centralizadas para não haver string solta pelo código. */
export const STORAGE_KEYS = {
  /** Client ID do AniList informado pelo usuário (RF-01). É configuração, não credencial. */
  clientId: 'anilist.clientId',
  /** Token do implicit grant (RF-03). Apagado ao sair (RF-06). */
  token: 'anilist.token',
  /** Estado dos filtros facetados (RF-16). */
  filter: 'anilist.filter',
  /** Momento em que a conversão de escala foi aplicada (RF-26). */
  conversionAppliedAt: 'anilist.conversion.appliedAt',
} as const;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage indisponível: seguimos sem persistir.
  }
}

export function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Idem.
  }
}

/**
 * Lê e desserializa. JSON corrompido devolve `null` em vez de lançar — dado de
 * conveniência inválido nunca deve impedir o app de abrir.
 *
 * O retorno é `unknown` de propósito: o que está no storage é entrada não
 * confiável e cada chamador precisa validar a forma antes de usar.
 */
export function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    // Valor não serializável: ignorado de propósito.
  }
}
