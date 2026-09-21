import { dot, sub, type Vec2 } from './vec.ts';

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

/** Distance from a point to a segment. */
export function distanceToSegment(p: Vec2, s: Segment): number {
  const c = closestPointOnSegment(p, s);
  return Math.hypot(p[0] - c[0], p[1] - c[1]);
}

/** Distance from a point to a polyline, and the index of the nearest segment. */
export function distanceToPolyline(p: Vec2, points: readonly Vec2[]): { distance: number; index: number } {
  let best = { distance: Infinity, index: -1 };
  for (let i = 1; i < points.length; i++) {
    const d = distanceToSegment(p, { start: points[i - 1]!, end: points[i]! });
    if (d < best.distance) best = { distance: d, index: i - 1 };
  }
  if (points.length === 1) return { distance: Math.hypot(p[0] - points[0]![0], p[1] - points[0]![1]), index: 0 };
  return best;
}
