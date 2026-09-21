import type { Entity } from '@cadw/core';
import { normalizeAngle, sweep, TWO_PI } from './curves.ts';
import { flattenEntity, toVec2 } from './entities.ts';
import type { Vec2 } from './vec.ts';

/**
 * Exact geometric primitives. Lines, polylines, arcs and circles decompose
 * exactly; ellipses and splines are approximated by segments within the
 * given tolerance (flagged `approx`). Snaps, intersections, trim and extend
 * all work on primitives, so one set of maths serves every entity kind.
 */
export type Primitive =
  | { readonly kind: 'seg'; readonly a: Vec2; readonly b: Vec2; readonly approx: boolean }
  | { readonly kind: 'arc'; readonly c: Vec2; readonly r: number; readonly a0: number; readonly a1: number; readonly full: boolean };

export function toPrimitives(entity: Entity, tolerance: number): Primitive[] {
  switch (entity.kind) {
    case 'line':
      return [{ kind: 'seg', a: toVec2(entity.start), b: toVec2(entity.end), approx: false }];
    case 'polyline': {
      const pts = entity.points.map(toVec2);
      const out: Primitive[] = [];
      for (let i = 1; i < pts.length; i++) out.push({ kind: 'seg', a: pts[i - 1]!, b: pts[i]!, approx: false });
      if (entity.closed && pts.length > 2) out.push({ kind: 'seg', a: pts[pts.length - 1]!, b: pts[0]!, approx: false });
      return out;
    }
    case 'arc':
      return [{ kind: 'arc', c: toVec2(entity.center), r: entity.radius, a0: entity.startAngle, a1: entity.endAngle, full: false }];
    case 'circle':
      return [{ kind: 'arc', c: toVec2(entity.center), r: entity.radius, a0: 0, a1: TWO_PI, full: true }];
    case 'ellipse':
    case 'spline': {
      const pts = flattenEntity(entity, tolerance);
      const out: Primitive[] = [];
      for (let i = 1; i < pts.length; i++) out.push({ kind: 'seg', a: pts[i - 1]!, b: pts[i]!, approx: true });
      return out;
    }
  }
}

const ANGLE_EPS = 1e-12;

/** Is `theta` on the arc (counter-clockwise from a0 to a1)? */
export function angleOnArc(theta: number, a0: number, a1: number, full = false): boolean {
  if (full) return true;
  return normalizeAngle(theta - a0) <= sweep(a0, a1) + ANGLE_EPS;
}

const onArc = (p: Primitive & { kind: 'arc' }, pt: Vec2) => angleOnArc(Math.atan2(pt[1] - p.c[1], pt[0] - p.c[0]), p.a0, p.a1, p.full);

/** Closest point on a primitive. */
export function closestOnPrimitive(p: Primitive, q: Vec2): Vec2 {
  if (p.kind === 'seg') {
    const dx = p.b[0] - p.a[0];
    const dy = p.b[1] - p.a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - p.a[0]) * dx + (q[1] - p.a[1]) * dy) / len2));
    return [p.a[0] + t * dx, p.a[1] + t * dy];
  }
  const theta = Math.atan2(q[1] - p.c[1], q[0] - p.c[0]);
  if (angleOnArc(theta, p.a0, p.a1, p.full)) return [p.c[0] + p.r * Math.cos(theta), p.c[1] + p.r * Math.sin(theta)];
  const e0: Vec2 = [p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0)];
  const e1: Vec2 = [p.c[0] + p.r * Math.cos(p.a1), p.c[1] + p.r * Math.sin(p.a1)];
  return Math.hypot(q[0] - e0[0], q[1] - e0[1]) <= Math.hypot(q[0] - e1[0], q[1] - e1[1]) ? e0 : e1;
}

/**
 * Foot of the perpendicular from `from` to the primitive, if it lands on it.
 * For arcs, both points where the line through the centre meets the circle
 * are candidates.
 */
export function perpendicularFeet(p: Primitive, from: Vec2): Vec2[] {
  if (p.kind === 'seg') {
    const dx = p.b[0] - p.a[0];
    const dy = p.b[1] - p.a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return [];
    const t = ((from[0] - p.a[0]) * dx + (from[1] - p.a[1]) * dy) / len2;
    return t >= -1e-12 && t <= 1 + 1e-12 ? [[p.a[0] + t * dx, p.a[1] + t * dy]] : [];
  }
  const d = Math.hypot(from[0] - p.c[0], from[1] - p.c[1]);
  if (d === 0) return [];
  const ux = (from[0] - p.c[0]) / d;
  const uy = (from[1] - p.c[1]) / d;
  const cands: Vec2[] = [
    [p.c[0] + p.r * ux, p.c[1] + p.r * uy],
    [p.c[0] - p.r * ux, p.c[1] - p.r * uy],
  ];
  return cands.filter((c) => onArc(p, c));
}

/** All intersection points between two primitives (tangent touches count once). */
export function intersectPrimitives(p: Primitive, q: Primitive): Vec2[] {
  if (p.kind === 'seg' && q.kind === 'seg') return segSeg(p.a, p.b, q.a, q.b);
  if (p.kind === 'seg' && q.kind === 'arc') return segCircle(p.a, p.b, q.c, q.r).filter((pt) => onArc(q, pt));
  if (p.kind === 'arc' && q.kind === 'seg') return segCircle(q.a, q.b, p.c, p.r).filter((pt) => onArc(p, pt));
  if (p.kind === 'arc' && q.kind === 'arc') return circleCircle(p.c, p.r, q.c, q.r).filter((pt) => onArc(p, pt) && onArc(q, pt));
  return [];
}

const PARAM_EPS = 1e-10;

export function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2[] {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  const scale = Math.hypot(...r) * Math.hypot(...s);
  if (scale === 0 || Math.abs(denom) <= 1e-12 * scale) return []; // parallel or degenerate: overlaps are not points
  const qp: Vec2 = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
  if (t < -PARAM_EPS || t > 1 + PARAM_EPS || u < -PARAM_EPS || u > 1 + PARAM_EPS) return [];
  return [[a[0] + t * r[0], a[1] + t * r[1]]];
}

export function segCircle(a: Vec2, b: Vec2, c: Vec2, r: number): Vec2[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - c[0];
  const fy = a[1] - c[1];
  const A = dx * dx + dy * dy;
  if (A === 0) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  let disc = B * B - 4 * A * C;
  const tangentEps = 1e-12 * Math.max(B * B, 4 * A * Math.abs(C), 1);
  if (disc < -tangentEps) return [];
  if (disc < tangentEps) disc = 0;
  const sq = Math.sqrt(disc);
  const ts = disc === 0 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  return ts.filter((t) => t >= -PARAM_EPS && t <= 1 + PARAM_EPS).map((t) => [a[0] + t * dx, a[1] + t * dy] as Vec2);
}

export function circleCircle(c0: Vec2, r0: number, c1: Vec2, r1: number): Vec2[] {
  const dx = c1[0] - c0[0];
  const dy = c1[1] - c0[1];
  const d = Math.hypot(dx, dy);
  const scale = Math.max(r0, r1, d);
  // Concentric (or numerically so): no intersection points, or infinitely many.
  if (d <= 1e-12 * scale) return [];
  if (d > r0 + r1 + 1e-12 * scale || d < Math.abs(r0 - r1) - 1e-12 * scale) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  const h = h2 <= 1e-12 * scale * scale ? 0 : Math.sqrt(h2);
  const mx = c0[0] + (a * dx) / d;
  const my = c0[1] + (a * dy) / d;
  if (h === 0) return [[mx, my]];
  return [
    [mx + (h * dy) / d, my - (h * dx) / d],
    [mx - (h * dy) / d, my + (h * dx) / d],
  ];
}

/** Intersections between two entities (deduplicated). */
export function intersectEntities(e1: Entity, e2: Entity, tolerance: number): Vec2[] {
  const p1 = toPrimitives(e1, tolerance);
  const p2 = toPrimitives(e2, tolerance);
  const out: Vec2[] = [];
  for (const a of p1) for (const b of p2) for (const pt of intersectPrimitives(a, b)) addUnique(out, pt, tolerance);
  return out;
}

/** Self-intersections are excluded: consecutive segments of one entity share vertices by design. */
export function addUnique(list: Vec2[], p: Vec2, tolerance: number): void {
  for (const q of list) if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance) return;
  list.push(p);
}
