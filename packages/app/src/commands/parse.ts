import type { Vec2 } from '@cadw/geom2d';

/**
 * Command-line input grammar (REQ-003.2), AutoCAD conventions:
 *
 *   100,50        absolute point
 *   @100,50       relative to the last point
 *   @100<45       relative polar: distance < angle (degrees, CCW from +X)
 *   100<45        absolute polar from the origin
 *   120           bare distance along the current rubber-band direction
 *   C / U / ...   a tool option keyword (case-insensitive)
 *   (empty)       Enter
 */
export type ParsedInput =
  | { readonly kind: 'point'; readonly point: Vec2 }
  | { readonly kind: 'distance'; readonly value: number }
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'enter' }
  | { readonly kind: 'error'; readonly message: string };

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const CARTESIAN = new RegExp(`^(@)?\\s*(${NUM})\\s*,\\s*(${NUM})$`);
const POLAR = new RegExp(`^(@)?\\s*(${NUM})\\s*<\\s*(${NUM})$`);
const DISTANCE = new RegExp(`^${NUM}$`);
const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function parseInput(raw: string, lastPoint: Vec2 | null): ParsedInput {
  const text = raw.trim();
  if (text === '') return { kind: 'enter' };

  const needsBase = (relative: boolean): Vec2 | null => (relative ? lastPoint : [0, 0]);

  const c = CARTESIAN.exec(text);
  if (c) {
    const base = needsBase(!!c[1]);
    if (!base) return { kind: 'error', message: 'No previous point for @ coordinates' };
    return { kind: 'point', point: [base[0] + Number(c[2]), base[1] + Number(c[3])] };
  }

  const p = POLAR.exec(text);
  if (p) {
    const base = needsBase(!!p[1]);
    if (!base) return { kind: 'error', message: 'No previous point for @ coordinates' };
    const d = Number(p[2]);
    const a = (Number(p[3]) * Math.PI) / 180;
    return { kind: 'point', point: [base[0] + d * Math.cos(a), base[1] + d * Math.sin(a)] };
  }

  if (DISTANCE.test(text)) return { kind: 'distance', value: Number(text) };
  if (WORD.test(text)) return { kind: 'word', value: text.toUpperCase() };
  return { kind: 'error', message: `Invalid input: ${text}` };
}

/** Point `distance` along the direction from `from` towards `toward` (the cursor). */
export function pointAlong(from: Vec2, toward: Vec2, distance: number): Vec2 | null {
  const dx = toward[0] - from[0];
  const dy = toward[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return [from[0] + (dx / len) * distance, from[1] + (dy / len) * distance];
}
