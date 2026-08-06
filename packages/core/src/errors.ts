/**
 * Erros tipados do domínio. A UI decide o que mostrar a partir do *tipo*,
 * nunca inspecionando o texto da mensagem.
 */

export class AniListError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Token ausente, inválido ou expirado (HTTP 401). Ver RF-05. */
export class AuthError extends AniListError {}

/** HTTP 429. `retryAfterMs` vem do header Retry-After. Ver RNF-04. */
export class RateLimitError extends AniListError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, options?: { cause?: unknown }) {
    super(message, options);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Falha de transporte: sem rede, DNS, timeout. */
export class NetworkError extends AniListError {}

/**
 * O endpoint de troca de token não está disponível nesta hospedagem.
 *
 * O AniList não manda CORS no `/oauth/token`, então o browser só consegue trocar
 * o code por token através de um proxy de mesma origem (ver AD-10). Num host
 * estático puro esse proxy não existe, e a UI precisa cair para o fluxo de colar
 * token (RF-04). É um erro de *ambiente*, não de credencial — daí não ser
 * `AuthError`: a distinção é o que decide qual tela mostrar.
 */
export class TokenExchangeUnavailableError extends AniListError {}

/** A resposta chegou com status 200 mas o corpo trouxe `errors`. */
export class GraphQLError extends AniListError {
  readonly errors: readonly { readonly message: string }[];

  constructor(message: string, errors: readonly { readonly message: string }[]) {
    super(message);
    this.errors = errors;
  }
}

/** Snapshot importado é inválido. `at` aponta onde. Ver RF-31. */
export class SnapshotParseError extends AniListError {
  readonly at: string;

  constructor(message: string, at: string) {
    super(message);
    this.at = at;
  }
}
