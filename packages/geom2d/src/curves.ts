import type { Vec2 } from './vec.ts';

/**
 * Curve sampling. Every function takes a chord tolerance in model units (mm)
 * and returns a polyline whose deviation from the true curve stays within it.
 */

export const TWO_PI = Math.PI * 2;

/** Normalises an angle to [0, 2π). */
export function normalizeAngle(a: number): number {
  const x = a % TWO_PI;
  return x < 0 ? x + TWO_PI : x;
}

/** Sweep from start to end, counter-clockwise, in (0, 2π]. */
export function sweep(startAngle: number, endAngle: number): number {
  const s = normalizeAngle(endAngle - startAngle);
  return s === 0 ? TWO_PI : s;
}

/** Number of chords needed so a circular arc of `radius` stays within `tolerance`. */
export function arcSegments(radius: number, sweepAngle: number, tolerance: number): number {
  if (!(radius > 0) || !(tolerance > 0)) return 2;
  const ratio = Math.min(1, Math.max(0, 1 - tolerance / radius));
  const maxStep = 2 * Math.acos(ratio);
  if (!Number.isFinite(maxStep) || maxStep <= 0) return 2048;
  return Math.min(4096, Math.max(2, Math.ceil(Math.abs(sweepAngle) / maxStep)));
}

export function arcPoint(center: Vec2, radius: number, angle: number): Vec2 {
  return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
}

export function flattenArc(center: Vec2, radius: number, startAngle: number, endAngle: number, tolerance: number): Vec2[] {
  const total = sweep(startAngle, endAngle);
  const n = arcSegments(radius, total, tolerance);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(arcPoint(center, radius, startAngle + (total * i) / n));
  return out;
}

export function flattenCircle(center: Vec2, radius: number, tolerance: number): Vec2[] {
  const n = arcSegments(radius, TWO_PI, tolerance);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) out.push(arcPoint(center, radius, (TWO_PI * i) / n));
  out.push(out[0]!);
  return out;
}

/**
 * Ellipse from centre, major-axis vector (centre → major endpoint) and
 * minor/major ratio. Sampling uses the major radius, so the tolerance holds
 * everywhere on the curve.
 */
export function flattenEllipse(center: Vec2, majorAxis: Vec2, ratio: number, tolerance: number): Vec2[] {
  const a = Math.hypot(majorAxis[0], majorAxis[1]);
  const b = a * ratio;
  const rot = Math.atan2(majorAxis[1], majorAxis[0]);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const n = arcSegments(a, TWO_PI, tolerance);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (TWO_PI * i) / n;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    out.push([center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]);
  }
  return out;
}

/**
 * Centripetal Catmull-Rom interpolation through `points` (ADR 0008).
 * Each segment is sampled by chord length so the tolerance is respected
 * without measuring true curvature.
 */
export function flattenSpline(points: readonly Vec2[], closed: boolean, tolerance: number): Vec2[] {
  const pts = points.map((p) => [p[0], p[1]] as Vec2);
  if (pts.length <= 2) return closed && pts.length === 2 ? [...pts, pts[0]!] : pts;

  const n = pts.length;
  const at = (i: number): Vec2 => {
    if (closed) return pts[((i % n) + n) % n]!;
    return pts[Math.min(n - 1, Math.max(0, i))]!;
  };

  const out: Vec2[] = [at(0)];
  const last = closed ? n - 1 : n - 2;
  for (let i = 0; i <= last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.min(256, Math.max(4, Math.ceil(Math.sqrt(chord / Math.max(tolerance, 1e-9)))));
    for (let s = 1; s <= steps; s++) out.push(catmullRomPoint(p0, p1, p2, p3, s / steps));
  }
  return out;
}

/** Centripetal (α = 0.5) Catmull-Rom point at parameter t within p1→p2. */
export function catmullRomPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const alpha = 0.5;
  const tj = (ti: number, a: Vec2, b: Vec2) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha);
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  // Degenerate (repeated) points fall back to linear interpolation.
  if (!(t1 > t0) || !(t2 > t1) || !(t3 > t2)) {
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  }
  const tt = t1 + (t2 - t1) * t;
  const lerp = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const k = (tb - tt) / (tb - ta);
    const m = (tt - ta) / (tb - ta);
    return [a[0] * k + b[0] * m, a[1] * k + b[1] * m];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * Circle through three points. Returns null when the points are collinear
 * (within `tolerance`, measured as twice the triangle area over the longest side).
 */
export function circleThrough(a: Vec2, b: Vec2, c: Vec2, tolerance = 1e-9): { center: Vec2; radius: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const longest = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]));
  if (longest === 0 || Math.abs(d) / longest <= tolerance) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { center: [cx, cy], radius: Math.hypot(a[0] - cx, a[1] - cy) };
}

/**
 * Arc through start → mid → end, as centre, radius and counter-clockwise
 * start/end angles. A clockwise pick is stored as the same arc swept CCW
 * from end to start, so every stored arc is CCW (ADR 0008).
 */
export function arcThrough(start: Vec2, mid: Vec2, end: Vec2): { center: Vec2; radius: number; startAngle: number; endAngle: number } | null {
  const circle = circleThrough(start, mid, end);
  if (!circle) return null;
  const { center, radius } = circle;
  const ang = (p: Vec2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const turn = (mid[0] - start[0]) * (end[1] - mid[1]) - (mid[1] - start[1]) * (end[0] - mid[0]);
  return turn > 0
    ? { center, radius, startAngle: ang(start), endAngle: ang(end) }
    : { center, radius, startAngle: ang(end), endAngle: ang(start) };
}
