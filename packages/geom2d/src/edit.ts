import type { ArcEntity, Entity, LineEntity, PolylineEntity, Vec3 } from '@cadw/core';
import { normalizeAngle, sweep, TWO_PI } from './curves.ts';
import { toVec2 } from './entities.ts';
import { intersectPrimitives, toPrimitives, type Primitive } from './primitives.ts';
import type { Vec2 } from './vec.ts';

/**
 * TRIM, EXTEND and OFFSET maths (REQ-003.6). Pure functions over entities:
 * the tools turn results into commands.
 *
 * M1 scope: lines, arcs, circles and polylines. Ellipses and splines can act
 * as cutting edges and boundaries, but are not themselves trimmed, extended
 * or offset yet (their offsets are not ellipses/splines; planned with M5).
 */
export type EditResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const PARAM_EPS = 1e-9;
const LEN_EPS = 1e-9;
const v3 = (p: Vec2, z = 0): Vec3 => [p[0], p[1], z];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (v: Vec2) => Math.hypot(v[0], v[1]);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const EDITABLE_KINDS = new Set(['line', 'arc', 'circle', 'polyline']);

function notEditable(e: Entity, verb: string): { ok: false; reason: string } {
  return { ok: false, reason: `${verb} of ${e.kind}s is not supported yet (lines, arcs, circles and polylines are)` };
}

// ------------------------------------------------------------ parameters

/** Points of a polyline as a list of vertices (closed ones repeat the first at the end). */
function polyVerts(e: PolylineEntity): Vec2[] {
  const pts = e.points.map(toVec2);
  return e.closed && pts.length > 2 ? [...pts, pts[0]!] : pts;
}

/** Parameter of point p on the entity: line 0..1, arc/circle angle offset, polyline segment index + t. */
function paramOf(e: Entity, prim: Primitive, primIndex: number, p: Vec2): number {
  if (prim.kind === 'seg') {
    const d = sub(prim.b, prim.a);
    const l2 = d[0] * d[0] + d[1] * d[1];
    const t = l2 === 0 ? 0 : ((p[0] - prim.a[0]) * d[0] + (p[1] - prim.a[1]) * d[1]) / l2;
    return e.kind === 'polyline' ? primIndex + Math.max(0, Math.min(1, t)) : Math.max(0, Math.min(1, t));
  }
  const theta = Math.atan2(p[1] - prim.c[1], p[0] - prim.c[0]);
  return normalizeAngle(theta - prim.a0);
}

/** Parameter range [0, L] and whether it wraps around (circle, closed polyline). */
function paramRange(e: Entity): { L: number; cyclic: boolean } {
  switch (e.kind) {
    case 'line':
      return { L: 1, cyclic: false };
    case 'arc':
      return { L: sweep(e.startAngle, e.endAngle), cyclic: false };
    case 'circle':
      return { L: TWO_PI, cyclic: true };
    case 'polyline':
      return { L: polyVerts(e).length - 1, cyclic: e.closed };
    default:
      return { L: 0, cyclic: false };
  }
}

/** The closest point's parameter on the entity. */
function pickParam(e: Entity, prims: Primitive[], p: Vec2): number {
  let best = { d: Infinity, t: 0 };
  prims.forEach((prim, i) => {
    let q: Vec2;
    if (prim.kind === 'seg') {
      const t = paramOf(e, prim, i, p) - (e.kind === 'polyline' ? i : 0);
      q = lerp(prim.a, prim.b, t);
    } else {
      const theta = Math.atan2(p[1] - prim.c[1], p[0] - prim.c[0]);
      q = [prim.c[0] + prim.r * Math.cos(theta), prim.c[1] + prim.r * Math.sin(theta)];
    }
    const d = len(sub(q, p));
    if (d < best.d) best = { d, t: paramOf(e, prim, i, q) };
  });
  return best.t;
}

/** Parameters where other entities cross this one. */
function cutParams(e: Entity, prims: Primitive[], others: readonly Entity[], tolerance: number): number[] {
  const cuts: number[] = [];
  for (const o of others) {
    if (o.id === e.id) continue;
    for (const q of toPrimitives(o, tolerance)) {
      prims.forEach((p, i) => {
        for (const pt of intersectPrimitives(p, q)) cuts.push(paramOf(e, p, i, pt));
      });
    }
  }
  cuts.sort((a, b) => a - b);
  return cuts.filter((c, i) => i === 0 || c - cuts[i - 1]! > PARAM_EPS);
}

/** Geometry of the entity between parameters s < t (both within range, no wrap). */
function piece(e: Entity, s: number, t: number): Entity | null {
  if (t - s <= PARAM_EPS) return null;
  switch (e.kind) {
    case 'line': {
      const a = toVec2(e.start);
      const b = toVec2(e.end);
      const p = lerp(a, b, s);
      const q = lerp(a, b, t);
      return len(sub(q, p)) > LEN_EPS ? ({ ...e, start: v3(p, e.start[2]), end: v3(q, e.end[2]) } satisfies LineEntity) : null;
    }
    case 'arc':
      return { ...e, startAngle: e.startAngle + s, endAngle: e.startAngle + t } satisfies ArcEntity;
    case 'circle':
      return { id: e.id, layer: e.layer, ...(e.style ? { style: e.style } : {}), kind: 'arc', center: e.center, radius: e.radius, startAngle: s, endAngle: t } as ArcEntity;
    case 'polyline': {
      const verts = polyVerts(e);
      const at = (u: number): Vec2 => {
        const i = Math.min(Math.floor(u), verts.length - 2);
        return lerp(verts[i]!, verts[i + 1]!, u - i);
      };
      const pts: Vec2[] = [at(s)];
      for (let k = Math.floor(s) + 1; k < t - PARAM_EPS; k++) pts.push(verts[k]!);
      pts.push(at(t));
      return { ...e, closed: false, points: pts.map((p) => v3(p)) } satisfies PolylineEntity;
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------ TRIM

export interface TrimResult {
  /** What stays, replacing the original (0, 1 or 2 pieces). */
  readonly kept: Entity[];
  /** The part that goes (for the preview). */
  readonly removed: Entity[];
}

/**
 * Removes the part of `e` around `pick` that lies between the nearest
 * crossings with `others` (AutoCAD's quick-trim: every entity is a cutting edge).
 */
export function trimEntity(e: Entity, pick: Vec2, others: readonly Entity[], tolerance: number): EditResult<TrimResult> {
  if (!EDITABLE_KINDS.has(e.kind)) return notEditable(e, 'Trimming');
  const prims = toPrimitives(e, tolerance);
  const { L, cyclic } = paramRange(e);
  const tp = pickParam(e, prims, pick);
  const cuts = cutParams(e, prims, others, tolerance).filter((c) => cyclic || (c > PARAM_EPS && c < L - PARAM_EPS));

  if (cyclic) {
    const cyc = cuts.map((c) => (c >= L - PARAM_EPS ? c - L : c)).sort((a, b) => a - b);
    if (cyc.length < 2) return { ok: false, reason: 'A closed curve needs at least two crossings to trim' };
    const below = cyc.filter((c) => c < tp);
    const above = cyc.filter((c) => c > tp);
    const lo = below.length ? below[below.length - 1]! : cyc[cyc.length - 1]! - L;
    const hi = above.length ? above[0]! : cyc[0]! + L;
    // Keep hi → lo + L going forward; remove lo → hi.
    return { ok: true, value: { kept: wrapPiece(e, hi, lo + L, L), removed: wrapPiece(e, lo, hi, L) } };
  }

  const lo = [...cuts].reverse().find((c) => c < tp);
  const hi = cuts.find((c) => c > tp);
  if (lo === undefined && hi === undefined) return { ok: false, reason: 'Nothing crosses this object here; nothing to trim' };
  const a = lo ?? 0;
  const b = hi ?? L;
  const kept = [lo !== undefined ? piece(e, 0, lo) : null, hi !== undefined ? piece(e, hi, L) : null].filter((x): x is Entity => !!x);
  const removed = [piece(e, a, b)].filter((x): x is Entity => !!x);
  return { ok: true, value: { kept, removed } };
}

/** A piece of a cyclic entity from s to t (t may exceed L: wraps). */
function wrapPiece(e: Entity, s: number, t: number, L: number): Entity[] {
  if (e.kind === 'circle') {
    const p = piece(e, s, t);
    return p ? [p] : [];
  }
  if (e.kind === 'polyline') {
    // Unroll the closed loop twice so a wrapping range is a straight slice.
    const verts = polyVerts(e);
    const loop = [...verts.slice(0, -1), ...verts];
    const unrolled: PolylineEntity = { ...e, closed: false, points: loop.map((p) => v3(p)) };
    const s0 = ((s % L) + L) % L; // normalise into one lap
    const p = piece(unrolled, s0, s0 + (t - s));
    return p ? [p] : [];
  }
  return [];
}

// ------------------------------------------------------------ EXTEND

const FAR = 1e7;

/** Extends the end of `e` nearest `pick` to the closest boundary among `others`. */
export function extendEntity(e: Entity, pick: Vec2, others: readonly Entity[], tolerance: number): EditResult<Entity> {
  const boundaries = others.filter((o) => o.id !== e.id).flatMap((o) => toPrimitives(o, tolerance));
  const none = { ok: false as const, reason: 'No boundary in that direction' };

  const extendRay = (from: Vec2, dir: Vec2): Vec2 | null => {
    const u = len(dir);
    if (u === 0) return null;
    const ray: Primitive = { kind: 'seg', a: from, b: [from[0] + (dir[0] / u) * FAR, from[1] + (dir[1] / u) * FAR], approx: false };
    let best: { d: number; p: Vec2 } | null = null;
    for (const b of boundaries) {
      for (const p of intersectPrimitives(ray, b)) {
        const d = len(sub(p, from));
        if (d > 1e-7 && (!best || d < best.d)) best = { d, p };
      }
    }
    return best?.p ?? null;
  };

  if (e.kind === 'line' || (e.kind === 'polyline' && !e.closed)) {
    const pts = e.kind === 'line' ? [toVec2(e.start), toVec2(e.end)] : e.points.map(toVec2);
    if (pts.length < 2) return none;
    const atEnd = len(sub(pick, pts[pts.length - 1]!)) < len(sub(pick, pts[0]!));
    const [tip, prev] = atEnd ? [pts[pts.length - 1]!, pts[pts.length - 2]!] : [pts[0]!, pts[1]!];
    const hit = extendRay(tip, sub(tip, prev));
    if (!hit) return none;
    if (e.kind === 'line') return { ok: true, value: atEnd ? { ...e, end: v3(hit, e.end[2]) } : { ...e, start: v3(hit, e.start[2]) } };
    const points = e.points.map((p, i) => (atEnd ? i === e.points.length - 1 : i === 0) ? v3(hit, p[2]) : p);
    return { ok: true, value: { ...e, points } };
  }

  if (e.kind === 'arc') {
    const c = toVec2(e.center);
    const full: Primitive = { kind: 'arc', c, r: e.radius, a0: 0, a1: TWO_PI, full: true };
    const s = sweep(e.startAngle, e.endAngle);
    const pEnd: Vec2 = [c[0] + e.radius * Math.cos(e.endAngle), c[1] + e.radius * Math.sin(e.endAngle)];
    const pStart: Vec2 = [c[0] + e.radius * Math.cos(e.startAngle), c[1] + e.radius * Math.sin(e.startAngle)];
    const atEnd = len(sub(pick, pEnd)) <= len(sub(pick, pStart));
    let bestDelta = Infinity;
    for (const b of boundaries) {
      for (const p of intersectPrimitives(full, b)) {
        const theta = Math.atan2(p[1] - c[1], p[0] - c[0]);
        const delta = atEnd ? normalizeAngle(theta - e.endAngle) : normalizeAngle(e.startAngle - theta);
        if (delta > 1e-9 && delta < TWO_PI - s - 1e-9 && delta < bestDelta) bestDelta = delta;
      }
    }
    if (!Number.isFinite(bestDelta)) return none;
    return { ok: true, value: atEnd ? { ...e, endAngle: e.endAngle + bestDelta } : { ...e, startAngle: e.startAngle - bestDelta } };
  }

  if (e.kind === 'circle' || e.kind === 'polyline') return { ok: false, reason: 'Closed objects have no end to extend' };
  return notEditable(e, 'Extending');
}

// ------------------------------------------------------------ OFFSET

/** Intersection of the infinite lines p + t·u and q + s·v, or null if parallel. */
function lineLine(p: Vec2, u: Vec2, q: Vec2, v: Vec2): Vec2 | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) <= 1e-12 * len(u) * len(v)) return null;
  const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [p[0] + t * u[0], p[1] + t * u[1]];
}

/**
 * A copy of `e` at `distance`, on the side of `side` (REQ-003.6).
 * Polyline corners are mitred (sharp), as AutoCAD does by default.
 */
export function offsetEntity(e: Entity, distance: number, side: Vec2): EditResult<Entity> {
  if (!(distance > 0)) return { ok: false, reason: 'Offset distance must be greater than zero' };
  switch (e.kind) {
    case 'line': {
      const a = toVec2(e.start);
      const b = toVec2(e.end);
      const d = sub(b, a);
      const l = len(d);
      const n: Vec2 = [-d[1] / l, d[0] / l];
      const sgn = Math.sign((side[0] - a[0]) * n[0] + (side[1] - a[1]) * n[1]) || 1;
      const o: Vec2 = [n[0] * distance * sgn, n[1] * distance * sgn];
      return { ok: true, value: { ...e, start: [a[0] + o[0], a[1] + o[1], e.start[2]], end: [b[0] + o[0], b[1] + o[1], e.end[2]] } };
    }
    case 'arc':
    case 'circle': {
      const outward = len(sub(side, toVec2(e.center))) > e.radius;
      const r = outward ? e.radius + distance : e.radius - distance;
      if (r <= LEN_EPS) return { ok: false, reason: 'The offset would collapse the curve to nothing' };
      return { ok: true, value: { ...e, radius: r } };
    }
    case 'polyline': {
      const pts = e.points.map(toVec2);
      if (pts.length < 2) return { ok: false, reason: 'Polyline has too few points' };
      const segs: [Vec2, Vec2][] = [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1]!, pts[i]!]);
      if (e.closed) segs.push([pts[pts.length - 1]!, pts[0]!]);
      const valid = segs.filter(([a, b]) => len(sub(b, a)) > LEN_EPS);
      if (valid.length === 0) return { ok: false, reason: 'Polyline has zero length' };
      // Side: sign relative to the segment nearest the side point.
      let nearest = 0;
      let bestD = Infinity;
      valid.forEach(([a, b], i) => {
        const d = sub(b, a);
        const l2 = d[0] * d[0] + d[1] * d[1];
        const t = Math.max(0, Math.min(1, ((side[0] - a[0]) * d[0] + (side[1] - a[1]) * d[1]) / l2));
        const dd = len(sub(side, lerp(a, b, t)));
        if (dd < bestD) {
          bestD = dd;
          nearest = i;
        }
      });
      const [na, nb] = valid[nearest]!;
      const nd = sub(nb, na);
      const sgn = Math.sign(-nd[1] * (side[0] - na[0]) + nd[0] * (side[1] - na[1])) || 1;
      const off = valid.map(([a, b]) => {
        const d = sub(b, a);
        const l = len(d);
        const o: Vec2 = [(-d[1] / l) * distance * sgn, (d[0] / l) * distance * sgn];
        return { p: [a[0] + o[0], a[1] + o[1]] as Vec2, q: [b[0] + o[0], b[1] + o[1]] as Vec2, u: d };
      });
      const joins: Vec2[] = [];
      const n = off.length;
      if (e.closed) {
        for (let i = 0; i < n; i++) {
          const prev = off[(i - 1 + n) % n]!;
          const cur = off[i]!;
          joins.push(lineLine(prev.p, prev.u, cur.p, cur.u) ?? cur.p);
        }
      } else {
        joins.push(off[0]!.p);
        for (let i = 1; i < n; i++) joins.push(lineLine(off[i - 1]!.p, off[i - 1]!.u, off[i]!.p, off[i]!.u) ?? off[i]!.p);
        joins.push(off[n - 1]!.q);
      }
      return { ok: true, value: { ...e, points: joins.map((p) => v3(p)) } };
    }
    default:
      return notEditable(e, 'Offsetting');
  }
}
