import type { Entity, Vec3 } from '@cadw/core';
import type { Vec2 } from './vec.ts';

/**
 * 2D similarity transforms (REQ-003.6): translation, rotation, uniform scale
 * and mirror. Stored as the affine matrix [a b c; d e f]:
 *   x' = a·x + b·y + c,   y' = d·x + e·y + f
 * Every entity kind maps exactly — circles stay circles, arcs stay CCW —
 * because only similarities are allowed.
 */
export interface Transform2 {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Transform2 = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 };

export const translation = (dx: number, dy: number): Transform2 => ({ a: 1, b: 0, c: dx, d: 0, e: 1, f: dy });

export function rotationAbout(base: Vec2, angle: number): Transform2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { a: cos, b: -sin, c: base[0] - cos * base[0] + sin * base[1], d: sin, e: cos, f: base[1] - sin * base[0] - cos * base[1] };
}

export function scaleAbout(base: Vec2, k: number): Transform2 {
  return { a: k, b: 0, c: base[0] * (1 - k), d: 0, e: k, f: base[1] * (1 - k) };
}

/** Reflection across the line through p and q. */
export function mirrorAcross(p: Vec2, q: Vec2): Transform2 {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len2 = dx * dx + dy * dy;
  const a = (dx * dx - dy * dy) / len2;
  const b = (2 * dx * dy) / len2;
  // Linear part [a b; b -a]; translation keeps p fixed.
  return { a, b, c: p[0] - a * p[0] - b * p[1], d: b, e: -a, f: p[1] - b * p[0] + a * p[1] };
}

export function applyPoint(t: Transform2, p: Vec2): Vec2 {
  return [t.a * p[0] + t.b * p[1] + t.c, t.d * p[0] + t.e * p[1] + t.f];
}

const apply3 = (t: Transform2, p: Vec3): Vec3 => {
  const [x, y] = applyPoint(t, [p[0], p[1]]);
  return [x, y, p[2]];
};
const applyVector = (t: Transform2, v: Vec3): Vec3 => [t.a * v[0] + t.b * v[1], t.d * v[0] + t.e * v[1], v[2]];

export const determinant = (t: Transform2) => t.a * t.e - t.b * t.d;
/** Uniform scale factor of a similarity. */
export const scaleOf = (t: Transform2) => Math.sqrt(Math.abs(determinant(t)));

export function transformEntity(entity: Entity, t: Transform2): Entity {
  const s = scaleOf(t);
  switch (entity.kind) {
    case 'line':
      return { ...entity, start: apply3(t, entity.start), end: apply3(t, entity.end) };
    case 'polyline':
    case 'spline':
      return { ...entity, points: entity.points.map((p) => apply3(t, p)) };
    case 'circle':
      return { ...entity, center: apply3(t, entity.center), radius: entity.radius * s };
    case 'arc': {
      const c = apply3(t, entity.center);
      const at = (a: number): Vec2 =>
        applyPoint(t, [entity.center[0] + entity.radius * Math.cos(a), entity.center[1] + entity.radius * Math.sin(a)]);
      const p0 = at(entity.startAngle);
      const p1 = at(entity.endAngle);
      const ang = (p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
      // A reflection reverses direction; swap ends so the stored arc stays CCW (ADR 0008).
      return determinant(t) >= 0
        ? { ...entity, center: c, radius: entity.radius * s, startAngle: ang(p0), endAngle: ang(p1) }
        : { ...entity, center: c, radius: entity.radius * s, startAngle: ang(p1), endAngle: ang(p0) };
    }
    case 'ellipse':
      return { ...entity, center: apply3(t, entity.center), majorAxis: applyVector(t, entity.majorAxis) };
  }
}
