import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Entity, EntityId } from '@cadw/core';
import {
  angleOnArc,
  circleCircle,
  closestOnPrimitive,
  intersectEntities,
  intersectPrimitives,
  perpendicularFeet,
  segCircle,
  segSeg,
  toPrimitives,
  type Primitive,
  type Vec2,
} from '../src/index.ts';

const e = (kind: string, rest: Record<string, unknown>): Entity => ({ id: 'x' as EntityId, layer: '0', kind, ...rest }) as Entity;
const close = (a: Vec2, b: Vec2, tol = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const coord = fc.double({ min: -1000, max: 1000, noNaN: true });
const vec = fc.tuple(coord, coord) as fc.Arbitrary<Vec2>;

describe('toPrimitives', () => {
  it('decomposes exactly where possible, approximately otherwise', () => {
    expect(toPrimitives(e('line', { start: [0, 0, 0], end: [1, 0, 0] }), 0.01)).toHaveLength(1);
    expect(toPrimitives(e('polyline', { points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], closed: true }), 0.01)).toHaveLength(3);
    expect(toPrimitives(e('circle', { center: [0, 0, 0], radius: 5 }), 0.01)[0]).toMatchObject({ kind: 'arc', full: true });
    const ell = toPrimitives(e('ellipse', { center: [0, 0, 0], majorAxis: [10, 0, 0], ratio: 0.5 }), 0.01);
    expect(ell.every((p) => p.kind === 'seg' && p.approx)).toBe(true);
  });
});

describe('intersections', () => {
  it('segment × segment: crossing, touching, parallel, apart', () => {
    expect(segSeg([0, 0], [10, 10], [0, 10], [10, 0])).toEqual([[5, 5]]);
    expect(segSeg([0, 0], [10, 0], [10, 0], [10, 5])).toHaveLength(1); // shared end
    expect(segSeg([0, 0], [10, 0], [0, 1], [10, 1])).toEqual([]);
    expect(segSeg([0, 0], [1, 0], [5, -1], [5, 1])).toEqual([]);
  });

  it('segment × circle: two points, tangent, miss', () => {
    expect(segCircle([-20, 0], [20, 0], [0, 0], 10)).toHaveLength(2);
    const t = segCircle([-20, 10], [20, 10], [0, 0], 10);
    expect(t).toHaveLength(1);
    expect(close(t[0]!, [0, 10])).toBe(true);
    expect(segCircle([-20, 11], [20, 11], [0, 0], 10)).toEqual([]);
  });

  it('circle × circle: two, tangent, none, concentric', () => {
    expect(circleCircle([0, 0], 10, [10, 0], 10)).toHaveLength(2);
    const t = circleCircle([0, 0], 5, [10, 0], 5);
    expect(t).toHaveLength(1);
    expect(close(t[0]!, [5, 0])).toBe(true);
    expect(circleCircle([0, 0], 1, [10, 0], 1)).toEqual([]);
    expect(circleCircle([0, 0], 1, [0, 0], 2)).toEqual([]);
    expect(circleCircle([0, 0], 0.1, [0, -5e-324], 0.1)).toEqual([]); // found by fast-check
  });

  it('arcs only intersect within their sweep', () => {
    const upper: Primitive = { kind: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI, full: false };
    const line: Primitive = { kind: 'seg', a: [-20, 0.5], b: [20, 0.5], approx: false };
    const below: Primitive = { kind: 'seg', a: [-20, -0.5], b: [20, -0.5], approx: false };
    expect(intersectPrimitives(upper, line)).toHaveLength(2);
    expect(intersectPrimitives(upper, below)).toHaveLength(0);
  });

  it('property: every segment × segment intersection lies on both segments', () => {
    fc.assert(
      fc.property(vec, vec, vec, vec, (a, b, c, d) => {
        for (const p of segSeg(a, b, c, d)) {
          const on = (s: Vec2, t: Vec2) =>
            Math.hypot(...(closestOnPrimitive({ kind: 'seg', a: s, b: t, approx: false }, p).map((v, i) => v - p[i]!) as [number, number])) <= 1e-6;
          expect(on(a, b) && on(c, d)).toBe(true);
        }
      }),
    );
  });

  it('property: circle × circle points are on both circles', () => {
    fc.assert(
      fc.property(vec, fc.double({ min: 0.1, max: 500, noNaN: true }), vec, fc.double({ min: 0.1, max: 500, noNaN: true }), (c0, r0, c1, r1) => {
        for (const p of circleCircle(c0, r0, c1, r1)) {
          expect(Math.hypot(p[0] - c0[0], p[1] - c0[1])).toBeCloseTo(r0, 5);
          expect(Math.hypot(p[0] - c1[0], p[1] - c1[1])).toBeCloseTo(r1, 5);
        }
      }),
    );
  });

  it('entity × entity: line through a circle, ellipse approximated within tolerance', () => {
    const line = e('line', { start: [-100, 0, 0], end: [100, 0, 0] });
    expect(intersectEntities(line, e('circle', { center: [0, 0, 0], radius: 50 }), 1e-6)).toHaveLength(2);
    const pts = intersectEntities(line, e('ellipse', { center: [0, 0, 0], majorAxis: [60, 0, 0], ratio: 0.5 }), 0.001);
    expect(pts).toHaveLength(2);
    for (const p of pts) expect(Math.abs(Math.abs(p[0]) - 60)).toBeLessThan(0.01);
  });
});

describe('closest point and perpendicular foot', () => {
  it('clamps to segment ends and arc ends', () => {
    expect(closestOnPrimitive({ kind: 'seg', a: [0, 0], b: [10, 0], approx: false }, [20, 5])).toEqual([10, 0]);
    const arc: Primitive = { kind: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI / 2, full: false };
    const p = closestOnPrimitive(arc, [-5, -5]);
    expect(close(p, [10, 0], 1e-9) || close(p, [0, 10], 1e-9)).toBe(true);
  });

  it('perpendicular feet on a segment and a circle', () => {
    expect(perpendicularFeet({ kind: 'seg', a: [0, 0], b: [10, 0], approx: false }, [4, 7])).toEqual([[4, 0]]);
    expect(perpendicularFeet({ kind: 'seg', a: [0, 0], b: [10, 0], approx: false }, [40, 7])).toEqual([]);
    const feet = perpendicularFeet({ kind: 'arc', c: [0, 0], r: 10, a0: 0, a1: 0, full: true }, [30, 0]);
    expect(feet).toHaveLength(2);
  });

  it('angleOnArc respects wrap-around sweeps', () => {
    expect(angleOnArc(0.1, (3 * Math.PI) / 2, Math.PI / 2)).toBe(true); // arc through 0
    expect(angleOnArc(Math.PI, (3 * Math.PI) / 2, Math.PI / 2)).toBe(false);
  });
});
