import type { Entity, Vec3 } from '@cadw/core';
import { arcThrough, sweep } from './curves.ts';
import { toVec2 } from './entities.ts';
import type { Vec2 } from './vec.ts';

/**
 * Grips (REQ-003.7): the handles shown on a selected entity. Dragging grip
 * `index` to a new point yields the edited entity; the app wraps that in an
 * `updateEntity` command so every grip edit is one undo step.
 */
export interface Grip {
  readonly index: number;
  readonly point: Vec2;
  /** 'move' grips translate the whole entity; 'shape' grips reshape it. */
  readonly role: 'move' | 'shape';
}

const v3 = (p: Vec2, z = 0): Vec3 => [p[0], p[1], z];
const polar = (c: Vec2, r: number, a: number): Vec2 => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
const add3 = (p: Vec3, d: Vec2): Vec3 => [p[0] + d[0], p[1] + d[1], p[2]];

export function gripsOf(e: Entity): Grip[] {
  switch (e.kind) {
    case 'line': {
      const a = toVec2(e.start);
      const b = toVec2(e.end);
      return [
        { index: 0, point: a, role: 'shape' },
        { index: 1, point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], role: 'move' },
        { index: 2, point: b, role: 'shape' },
      ];
    }
    case 'polyline':
    case 'spline':
      return e.points.map((p, index) => ({ index, point: toVec2(p), role: 'shape' as const }));
    case 'arc': {
      const c = toVec2(e.center);
      const mid = e.startAngle + sweep(e.startAngle, e.endAngle) / 2;
      return [
        { index: 0, point: polar(c, e.radius, e.startAngle), role: 'shape' },
        { index: 1, point: polar(c, e.radius, mid), role: 'shape' },
        { index: 2, point: polar(c, e.radius, e.endAngle), role: 'shape' },
        { index: 3, point: c, role: 'move' },
      ];
    }
    case 'circle': {
      const c = toVec2(e.center);
      return [
        { index: 0, point: c, role: 'move' },
        ...[0, 1, 2, 3].map((k) => ({ index: k + 1, point: polar(c, e.radius, (k * Math.PI) / 2), role: 'shape' as const })),
      ];
    }
    case 'ellipse': {
      const c = toVec2(e.center);
      const [mx, my] = [e.majorAxis[0], e.majorAxis[1]];
      const [nx, ny] = [-my * e.ratio, mx * e.ratio];
      return [
        { index: 0, point: c, role: 'move' },
        { index: 1, point: [c[0] + mx, c[1] + my], role: 'shape' },
        { index: 2, point: [c[0] - mx, c[1] - my], role: 'shape' },
        { index: 3, point: [c[0] + nx, c[1] + ny], role: 'shape' },
        { index: 4, point: [c[0] - nx, c[1] - ny], role: 'shape' },
      ];
    }
  }
}

/**
 * The entity after dragging grip `index` to `to`. Returns null when the drag
 * would make the entity degenerate (zero radius, collinear arc points…).
 */
export function moveGrip(e: Entity, index: number, to: Vec2): Entity | null {
  const grips = gripsOf(e);
  const grip = grips.find((g) => g.index === index);
  if (!grip) return null;
  const delta: Vec2 = [to[0] - grip.point[0], to[1] - grip.point[1]];

  switch (e.kind) {
    case 'line':
      if (index === 1) return { ...e, start: add3(e.start, delta), end: add3(e.end, delta) };
      {
        const next = index === 0 ? { ...e, start: v3(to, e.start[2]) } : { ...e, end: v3(to, e.end[2]) };
        return Math.hypot(next.end[0] - next.start[0], next.end[1] - next.start[1]) > 1e-9 ? next : null;
      }
    case 'polyline':
    case 'spline': {
      const points = e.points.map((p, i) => (i === index ? v3(to, p[2]) : p));
      return { ...e, points };
    }
    case 'arc': {
      if (index === 3) return { ...e, center: add3(e.center, delta) };
      const pts = [grips[0]!.point, grips[1]!.point, grips[2]!.point];
      pts[index] = to;
      const a = arcThrough(pts[0]!, pts[1]!, pts[2]!);
      if (!a) return null;
      return { ...e, center: [a.center[0], a.center[1], e.center[2]], radius: a.radius, startAngle: a.startAngle, endAngle: a.endAngle };
    }
    case 'circle': {
      if (index === 0) return { ...e, center: add3(e.center, delta) };
      const r = Math.hypot(to[0] - e.center[0], to[1] - e.center[1]);
      return r > 1e-9 ? { ...e, radius: r } : null;
    }
    case 'ellipse': {
      if (index === 0) return { ...e, center: add3(e.center, delta) };
      const c = toVec2(e.center);
      const d: Vec2 = [to[0] - c[0], to[1] - c[1]];
      const len = Math.hypot(d[0], d[1]);
      if (len <= 1e-9) return null;
      const a = Math.hypot(e.majorAxis[0], e.majorAxis[1]);
      const b = a * e.ratio;
      if (index === 1 || index === 2) {
        // New major axis direction and length; minor length unchanged.
        const dir: Vec2 = index === 1 ? d : [-d[0], -d[1]];
        if (b <= len) return { ...e, majorAxis: [dir[0], dir[1], 0], ratio: b / len };
        const perp: Vec2 = [(-dir[1] / len) * b, (dir[0] / len) * b];
        return { ...e, majorAxis: [perp[0], perp[1], 0], ratio: len / b };
      }
      // Minor grip: new minor length = distance from centre; axes swap if it grows past the major.
      if (len <= a) return { ...e, ratio: len / a };
      const ux = e.majorAxis[0] / a;
      const uy = e.majorAxis[1] / a;
      return { ...e, majorAxis: [-uy * len, ux * len, 0], ratio: a / len };
    }
  }
}
