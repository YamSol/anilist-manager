/**
 * Marcador de contrato ainda não implementado.
 *
 * Existe só durante a fase de esqueleto: permite que `apps/web` compile contra o
 * contrato congelado (§5 de docs/REQUIREMENTS.md) enquanto `packages/core` é
 * implementado em paralelo. **Este arquivo é removido ao final da branch feat/core** —
 * nenhuma função exportada pode continuar chamando `notImplemented` depois disso.
 */
export function notImplemented(name: string): never {
  throw new Error(
    `[stub] ${name} ainda não foi implementado. Contrato em docs/REQUIREMENTS.md §5.`,
  );
}
