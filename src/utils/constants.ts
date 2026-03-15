// ─── Recargos por tarjeta de crédito ─────────────────────────────────────────

/**
 * Porcentaje de recargo por cantidad de cuotas.
 *   1 cuota  →  5 %
 *   2 cuotas →  7 %
 *   3 cuotas → 10 %
 *   6 cuotas → 15 %
 */
export const RECARGOS_CREDITO: Record<number, number> = {
  1: 0.05,
  2: 0.07,
  3: 0.10,
  6: 0.15,
};

/** Cuotas disponibles para tarjeta de crédito */
export const CUOTAS_CREDITO = [1, 2, 3, 6] as const;
