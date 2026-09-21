import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Entity, EntityId, Vec3 } from '@cadw/core';
import {
  arcSegments,
  boundsOf,
  entityBounds,
  entityLength,
  flattenArc,
  flattenCircle,
  flattenEllipse,
  flattenEntity,
  flattenSpline,
  normalizeAngle,
  sweep,
  TWO_PI,
  type Vec2,
} from '../src/index.ts';

const TOL = 0.01; // mm

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const e = (kind: string, rest: Record<string, unknown>): Entity =>
  ({ id: 'x' as EntityId, layer: '0', kind, ...rest }) as Entity;

describe('angles', () => {
  it('normalises into [0, 2π) and sweeps counter-clockwise', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(sweep(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
    expect(sweep(Math.PI / 2, 0)).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(sweep(1, 1)).toBeCloseTo(TWO_PI, 12); // full circle, not zero
  });
});

describe('flattening stays within tolerance', () => {
  it('arc: every sample is on the circle and chords stay within tolerance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: TWO_PI, noNaN: true }),
        fc.double({ min: 0.01, max: TWO_PI, noNaN: true }),
        (radius, start, span) => {
          const pts = flattenArc([10, -5], radius, start, start + span, TOL);
          for (const p of pts) expect(dist(p, [10, -5])).toBeCloseTo(radius, 6);
          for (let i = 1; i < pts.length; i++) {
            const mid: Vec2 = [(pts[i]![0] + pts[i - 1]![0]) / 2, (pts[i]![1] + pts[i - 1]![1]) / 2];
            expect(radius - dist(mid, [10, -5])).toBeLessThanOrEqual(TOL * 1.0001);
          }
        },
      ),
    );
  });

  it('circle: closes exactly and approximates 2πr', () => {
    const pts = flattenCircle([0, 0], 100, TOL);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    const len = entityLength(e('circle', { center: [0, 0, 0] as Vec3, radius: 100 }), TOL);
    expect(len).toBeGreaterThan(TWO_PI * 100 * 0.999);
    expect(len).toBeLessThanOrEqual(TWO_PI * 100);
  });

  it('ellipse: respects the ellipse equation in its own frame', () => {
    const a = 80;
    const ratio = 0.4;
    const rot = 0.7;
    const major: Vec2 = [a * Math.cos(rot), a * Math.sin(rot)];
    for (const p of flattenEllipse([5, 5], major, ratio, TOL)) {
      const dx = p[0] - 5;
      const dy = p[1] - 5;
      const u = dx * Math.cos(rot) + dy * Math.sin(rot);
      const v = -dx * Math.sin(rot) + dy * Math.cos(rot);
      expect((u * u) / (a * a) + (v * v) / (a * ratio * (a * ratio))).toBeCloseTo(1, 6);
    }
  });

  it('finer tolerance never means fewer segments', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1000, noNaN: true }), (r) => {
        expect(arcSegments(r, TWO_PI, 0.001)).toBeGreaterThanOrEqual(arcSegments(r, TWO_PI, 0.1));
      }),
    );
  });
});

describe('spline (ADR 0008)', () => {
  const pts: Vec2[] = [
    [0, 0],
    [30, 40],
    [70, -20],
    [100, 10],
  ];

  it('passes through every fit point, in order', () => {
    const out = flattenSpline(pts, false, TOL);
    for (const fit of pts) expect(Math.min(...out.map((p) => dist(p, fit)))).toBeLessThan(1e-9);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('closes the loop when closed', () => {
    const out = flattenSpline(pts, true, TOL);
    expect(dist(out[0]!, out[out.length - 1]!)).toBeLessThan(1e-9);
  });

  it('handles degenerate inputs: repeated and too-few points', () => {
    expect(flattenSpline([[0, 0]], false, TOL)).toEqual([[0, 0]]);
    expect(flattenSpline([[0, 0], [10, 0]], false, TOL)).toHaveLength(2);
    const repeated = flattenSpline([[0, 0], [0, 0], [10, 0], [10, 0]], false, TOL);
    expect(repeated.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });

  it('property: stays inside the fit points’ box, grown by the largest gap', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: -500, max: 500, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true })), {
          minLength: 3,
          maxLength: 12,
        }),
        (raw) => {
          const points = raw as Vec2[];
          const box = boundsOf(points)!;
          const span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1]) + 1;
          for (const p of flattenSpline(points, false, TOL)) {
            expect(p[0]).toBeGreaterThanOrEqual(box.min[0] - span);
            expect(p[0]).toBeLessThanOrEqual(box.max[0] + span);
            expect(p[1]).toBeGreaterThanOrEqual(box.min[1] - span);
            expect(p[1]).toBeLessThanOrEqual(box.max[1] + span);
          }
        },
      ),
    );
  });
});

describe('flattenEntity + entityBounds', () => {
  it('handles every entity kind', () => {
    const all: Entity[] = [
      e('line', { start: [0, 0, 0], end: [10, 0, 0] }),
      e('polyline', { points: [[0, 0, 0], [5, 5, 0], [10, 0, 0]], closed: true }),
      e('arc', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI }),
      e('circle', { center: [0, 0, 0], radius: 10 }),
      e('ellipse', { center: [0, 0, 0], majorAxis: [10, 0, 0], ratio: 0.5 }),
      e('spline', { points: [[0, 0, 0], [5, 5, 0], [10, 0, 0]], closed: false }),
    ];
    for (const entity of all) {
      expect(flattenEntity(entity, TOL).length).toBeGreaterThanOrEqual(2);
      expect(entityBounds(entity, TOL)).not.toBeNull();
    }
  });

  it('closed polylines return to their first point', () => {
    const pts = flattenEntity(e('polyline', { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: true }), TOL);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
  });

  it('circle bounds are exact, not sampled', () => {
    const b = entityBounds(e('circle', { center: [3, 4, 0], radius: 10 }), 1)!;
    expect(b.min).toEqual([-7, -6]);
    expect(b.max).toEqual([13, 14]);
  });
});
