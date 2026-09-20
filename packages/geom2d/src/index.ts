/** Pure 2D geometry. No dependencies; everything here is unit- and property-tested. */
export type Vec2 = readonly [number, number];

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const length = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

export interface Segment {
  readonly start: Vec2;
  readonly end: Vec2;
}

/** Closest point on a segment to p (clamped to the segment). */
export function closestPointOnSegment(p: Vec2, s: Segment): Vec2 {
  const d = sub(s.end, s.start);
  const len2 = dot(d, d);
  if (len2 === 0) return s.start;
  const t = Math.max(0, Math.min(1, dot(sub(p, s.start), d) / len2));
  return [s.start[0] + t * d[0], s.start[1] + t * d[1]];
}

export interface Snap {
  readonly point: Vec2;
  readonly kind: 'endpoint' | 'midpoint';
  readonly distance: number;
}

/**
 * Finds the nearest endpoint or midpoint within `radius` (model units).
 * Endpoints win ties so drawing connected lines is predictable.
 */
export function findSnap(p: Vec2, segments: readonly Segment[], radius: number): Snap | null {
  let best: Snap | null = null;
  const consider = (point: Vec2, kind: Snap['kind']) => {
    const d = distance(p, point);
    if (d > radius) return;
    if (!best || d < best.distance || (d === best.distance && kind === 'endpoint' && best.kind !== 'endpoint')) {
      best = { point, kind, distance: d };
    }
  };
  for (const s of segments) {
    consider(s.start, 'endpoint');
    consider(s.end, 'endpoint');
    consider([(s.start[0] + s.end[0]) / 2, (s.start[1] + s.end[1]) / 2], 'midpoint');
  }
  return best;
}
