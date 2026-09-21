import type { Entity } from '@cadw/core';
import { sweep } from './curves.ts';
import { entityBounds, toVec2 } from './entities.ts';
import { addUnique, closestOnPrimitive, intersectPrimitives, perpendicularFeet, toPrimitives, type Primitive } from './primitives.ts';
import type { Vec2 } from './vec.ts';

/** Object snap kinds (REQ-003.3), in AutoCAD's order of preference. */
export type SnapKind = 'endpoint' | 'intersection' | 'midpoint' | 'center' | 'quadrant' | 'perpendicular' | 'nearest';

export const ALL_SNAP_KINDS: readonly SnapKind[] = ['endpoint', 'intersection', 'midpoint', 'center', 'quadrant', 'perpendicular', 'nearest'];

export interface Snap {
  readonly point: Vec2;
  readonly kind: SnapKind;
  readonly distance: number;
}

export interface SnapOptions {
  /** Which snaps are on. */
  readonly enabled: ReadonlySet<SnapKind>;
  /** Aperture in model units (the app passes pixels × units-per-pixel). */
  readonly radius: number;
  /** Base point of the active tool, for perpendicular. */
  readonly from?: Vec2 | null;
  /** Flattening tolerance for ellipses and splines. */
  readonly tolerance: number;
}

// Point snaps compete on distance; perpendicular, then nearest, only when no point snap is in range.
const POINT_SNAPS: readonly SnapKind[] = ['endpoint', 'intersection', 'midpoint', 'center', 'quadrant'];

const d2 = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polar = (c: Vec2, r: number, a: number): Vec2 => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

/** Characteristic points of one entity, by snap kind. */
function keyPoints(e: Entity): { kind: SnapKind; point: Vec2 }[] {
  const out: { kind: SnapKind; point: Vec2 }[] = [];
  switch (e.kind) {
    case 'line': {
      const a = toVec2(e.start);
      const b = toVec2(e.end);
      out.push({ kind: 'endpoint', point: a }, { kind: 'endpoint', point: b }, { kind: 'midpoint', point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
      break;
    }
    case 'polyline': {
      const pts = e.points.map(toVec2);
      for (const p of pts) out.push({ kind: 'endpoint', point: p });
      const n = e.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        out.push({ kind: 'midpoint', point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
      }
      break;
    }
    case 'arc': {
      const c = toVec2(e.center);
      const s = sweep(e.startAngle, e.endAngle);
      out.push(
        { kind: 'endpoint', point: polar(c, e.radius, e.startAngle) },
        { kind: 'endpoint', point: polar(c, e.radius, e.endAngle) },
        { kind: 'midpoint', point: polar(c, e.radius, e.startAngle + s / 2) },
      );
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const rel = (((a - e.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (rel <= s + 1e-12) out.push({ kind: 'quadrant', point: polar(c, e.radius, a) });
      }
      break;
    }
    case 'circle': {
      const c = toVec2(e.center);
      for (let k = 0; k < 4; k++) out.push({ kind: 'quadrant', point: polar(c, e.radius, (k * Math.PI) / 2) });
      break;
    }
    case 'ellipse': {
      const c = toVec2(e.center);
      const [mx, my] = [e.majorAxis[0], e.majorAxis[1]];
      const [nx, ny] = [-my * e.ratio, mx * e.ratio];
      out.push(
        { kind: 'quadrant', point: [c[0] + mx, c[1] + my] },
        { kind: 'quadrant', point: [c[0] - mx, c[1] - my] },
        { kind: 'quadrant', point: [c[0] + nx, c[1] + ny] },
        { kind: 'quadrant', point: [c[0] - nx, c[1] - ny] },
      );
      break;
    }
    case 'spline':
      if (!e.closed && e.points.length > 0) {
        out.push({ kind: 'endpoint', point: toVec2(e.points[0]!) }, { kind: 'endpoint', point: toVec2(e.points[e.points.length - 1]!) });
      }
      break;
  }
  return out;
}

function centerOf(e: Entity): Vec2 | null {
  return e.kind === 'arc' || e.kind === 'circle' || e.kind === 'ellipse' ? toVec2(e.center) : null;
}

/**
 * Finds the object snap for a cursor position (REQ-003.3).
 * Point snaps (endpoint, intersection, midpoint, centre, quadrant) win on
 * distance; perpendicular applies only if none is in range, then nearest.
 * Centre is offered when the cursor is near the centre or on the curve,
 * as in AutoCAD, but a real point snap in range is preferred.
 */
export function findObjectSnap(cursor: Vec2, entities: readonly Entity[], opts: SnapOptions): Snap | null {
  const { enabled, radius } = opts;
  if (enabled.size === 0 || radius <= 0) return null;

  // Entities whose bounds come within the aperture.
  const near: { e: Entity; prims: Primitive[] }[] = [];
  const centreOnly: Entity[] = [];
  for (const e of entities) {
    const b = entityBounds(e, opts.tolerance);
    const inRange = b && cursor[0] >= b.min[0] - radius && cursor[0] <= b.max[0] + radius && cursor[1] >= b.min[1] - radius && cursor[1] <= b.max[1] + radius;
    if (inRange) near.push({ e, prims: toPrimitives(e, opts.tolerance) });
    else if (enabled.has('center') && centerOf(e)) centreOnly.push(e);
  }

  let best: Snap | null = null;
  const offer = (kind: SnapKind, point: Vec2, rank = d2(cursor, point)) => {
    if (!enabled.has(kind) || rank > radius) return;
    const tier = POINT_SNAPS.indexOf(kind);
    if (!best || rank < best.distance - 1e-12 || (Math.abs(rank - best.distance) <= 1e-12 && tier < POINT_SNAPS.indexOf(best.kind))) {
      best = { point, kind, distance: rank };
    }
  };

  for (const { e, prims } of near) {
    for (const k of keyPoints(e)) offer(k.kind, k.point);
    const c = centerOf(e);
    if (c && enabled.has('center')) {
      const onCurve = Math.min(...prims.map((p) => d2(cursor, closestOnPrimitive(p, cursor))));
      // Hovering the curve offers its centre, ranked behind true point snaps.
      offer('center', c, Math.min(d2(cursor, c), onCurve <= radius ? onCurve + radius * 0.5 : Infinity));
    }
  }
  for (const e of centreOnly) offer('center', centerOf(e)!);

  if (enabled.has('intersection')) {
    const pts: Vec2[] = [];
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        for (const a of near[i]!.prims) for (const b of near[j]!.prims) for (const p of intersectPrimitives(a, b)) if (d2(cursor, p) <= radius) addUnique(pts, p, 1e-9);
      }
    }
    for (const p of pts) offer('intersection', p);
  }
  if (best) return best;

  if (enabled.has('perpendicular') && opts.from) {
    let perp: Snap | null = null;
    for (const { prims } of near) {
      for (const p of prims) {
        for (const f of perpendicularFeet(p, opts.from)) {
          const d = d2(cursor, f);
          if (d <= radius && (!perp || d < perp.distance)) perp = { point: f, kind: 'perpendicular', distance: d };
        }
      }
    }
    if (perp) return perp;
  }

  if (enabled.has('nearest')) {
    let nearest: Snap | null = null;
    for (const { prims } of near) {
      for (const p of prims) {
        const q = closestOnPrimitive(p, cursor);
        const d = d2(cursor, q);
        if (d <= radius && (!nearest || d < nearest.distance)) nearest = { point: q, kind: 'nearest', distance: d };
      }
    }
    return nearest;
  }
  return null;
}
