import type { Entity, EntityId } from '@cadw/core';
import { entityBounds, flattenEntity } from './entities.ts';
import { closestOnPrimitive, segSeg, toPrimitives } from './primitives.ts';
import { boxContains, type Box2, type Vec2 } from './vec.ts';

/** Normalised box from two corner points in any order. */
export function boxFrom(a: Vec2, b: Vec2): Box2 {
  return { min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
}

/** The entity whose curve passes closest to `p`, within `radius`; later entities win ties (drawn on top). */
export function pickEntity(p: Vec2, entities: readonly Entity[], radius: number, tolerance: number): EntityId | null {
  let best: { id: EntityId; d: number } | null = null;
  for (const e of entities) {
    const b = entityBounds(e, tolerance);
    if (!b || p[0] < b.min[0] - radius || p[0] > b.max[0] + radius || p[1] < b.min[1] - radius || p[1] > b.max[1] + radius) continue;
    for (const prim of toPrimitives(e, tolerance)) {
      const q = closestOnPrimitive(prim, p);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= radius && (!best || d <= best.d)) best = { id: e.id, d };
    }
  }
  return best?.id ?? null;
}

/** Window selection: entities entirely inside the box (REQ-003.5). */
export function windowSelect(box: Box2, entities: readonly Entity[], tolerance: number): EntityId[] {
  return entities.filter((e) => {
    const b = entityBounds(e, tolerance);
    return !!b && boxContains(box, b);
  }).map((e) => e.id);
}

const inside = (box: Box2, p: Vec2) => p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] && p[1] <= box.max[1];

/** Crossing selection: entities inside or touching the box (REQ-003.5). */
export function crossingSelect(box: Box2, entities: readonly Entity[], tolerance: number): EntityId[] {
  const corners: Vec2[] = [box.min, [box.max[0], box.min[1]], box.max, [box.min[0], box.max[1]]];
  const edges = corners.map((c, i) => [c, corners[(i + 1) % 4]!] as const);
  return entities
    .filter((e) => {
      const b = entityBounds(e, tolerance);
      if (!b || b.max[0] < box.min[0] || b.min[0] > box.max[0] || b.max[1] < box.min[1] || b.min[1] > box.max[1]) return false;
      const pts = flattenEntity(e, tolerance);
      if (pts.some((p) => inside(box, p))) return true;
      for (let i = 1; i < pts.length; i++) {
        for (const [a, c] of edges) if (segSeg(pts[i - 1]!, pts[i]!, a, c).length > 0) return true;
      }
      return false;
    })
    .map((e) => e.id);
}
