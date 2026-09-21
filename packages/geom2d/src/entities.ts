import type { Entity, Vec3 } from '@cadw/core';
import { flattenArc, flattenCircle, flattenEllipse, flattenSpline } from './curves.ts';
import { boundsOf, type Box2, type Vec2 } from './vec.ts';

/** Default chord tolerance in mm when a caller has no viewport scale to offer. */
export const DEFAULT_FLATTEN_TOLERANCE = 0.05;

export const toVec2 = (p: Vec3): Vec2 => [p[0], p[1]];

/**
 * Entity → polyline in model units, within `tolerance` of the true curve.
 * One implementation used by rendering, hit-testing, printing and export
 * (ADR 0008), so every part of the app sees the same curve.
 */
export function flattenEntity(entity: Entity, tolerance: number = DEFAULT_FLATTEN_TOLERANCE): Vec2[] {
  const tol = Math.max(tolerance, 1e-9);
  switch (entity.kind) {
    case 'line':
      return [toVec2(entity.start), toVec2(entity.end)];
    case 'polyline': {
      const pts = entity.points.map(toVec2);
      return entity.closed && pts.length > 1 ? [...pts, pts[0]!] : pts;
    }
    case 'arc':
      return flattenArc(toVec2(entity.center), entity.radius, entity.startAngle, entity.endAngle, tol);
    case 'circle':
      return flattenCircle(toVec2(entity.center), entity.radius, tol);
    case 'ellipse':
      return flattenEllipse(toVec2(entity.center), toVec2(entity.majorAxis), entity.ratio, tol);
    case 'spline':
      return flattenSpline(entity.points.map(toVec2), entity.closed, tol);
  }
}

/** Tight-enough bounding box (uses the flattened curve, so within `tolerance`). */
export function entityBounds(entity: Entity, tolerance: number = DEFAULT_FLATTEN_TOLERANCE): Box2 | null {
  if (entity.kind === 'circle') {
    const [cx, cy] = toVec2(entity.center);
    const r = entity.radius;
    return { min: [cx - r, cy - r], max: [cx + r, cy + r] };
  }
  return boundsOf(flattenEntity(entity, tolerance));
}

/** Total length of the flattened curve — used by tests and, later, by attributes. */
export function entityLength(entity: Entity, tolerance: number = DEFAULT_FLATTEN_TOLERANCE): number {
  const pts = flattenEntity(entity, tolerance);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return total;
}
