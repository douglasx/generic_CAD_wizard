import { closestPointOnSegment, type Segment } from './segment.ts';
import { distance, type Vec2 } from './vec.ts';

export type SnapKind = 'endpoint' | 'midpoint';

export interface Snap {
  readonly point: Vec2;
  readonly kind: SnapKind;
  readonly distance: number;
}

/**
 * Nearest endpoint or midpoint within `radius` (model units).
 * Endpoints win ties so drawing connected lines is predictable.
 * The full snap set (centre, quadrant, intersection, perpendicular, nearest)
 * arrives in slice 4.
 */
export function findSnap(p: Vec2, segments: readonly Segment[], radius: number): Snap | null {
  let best: Snap | null = null;
  const consider = (point: Vec2, kind: SnapKind) => {
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

export { closestPointOnSegment };
export type { Segment };
