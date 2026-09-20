/**
 * Units and tolerances — the single source of truth (CLAUDE.md guardrail 4).
 * Internal length unit is the millimetre.
 */
export const LENGTH_UNIT = 'mm' as const;

/** Linear tolerance in mm used for geometric equality. */
export const LINEAR_TOLERANCE = 1e-6;

/** Angular tolerance in radians. */
export const ANGULAR_TOLERANCE = 1e-9;

/** Relative tolerance for derived quantities such as area and volume. */
export const RELATIVE_TOLERANCE = 1e-9;

export function nearlyEqual(a: number, b: number, tol: number = LINEAR_TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

export function relativelyEqual(a: number, b: number, rel: number = RELATIVE_TOLERANCE): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= rel * scale;
}
