import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ArcEntity, Entity, EntityId } from '@cadw/core';
import {
  applyPoint,
  entityLength,
  flattenEntity,
  mirrorAcross,
  rotationAbout,
  scaleAbout,
  sweep,
  transformEntity,
  translation,
  type Transform2,
  type Vec2,
} from '../src/index.ts';

const e = (kind: string, rest: Record<string, unknown>): Entity => ({ id: 'x' as EntityId, layer: '0', kind, ...rest }) as Entity;
const samples: Entity[] = [
  e('line', { start: [1, 2, 0], end: [40, -7, 0] }),
  e('polyline', { points: [[0, 0, 0], [30, 5, 0], [10, 40, 0]], closed: true }),
  e('arc', { center: [5, 5, 0], radius: 20, startAngle: 0.4, endAngle: 2.5 }),
  e('circle', { center: [-3, 8, 0], radius: 12 }),
  e('ellipse', { center: [2, 2, 0], majorAxis: [25, 10, 0], ratio: 0.4 }),
  e('spline', { points: [[0, 0, 0], [20, 30, 0], [50, -10, 0], [70, 20, 0]], closed: false }),
];
const TOL = 1e-4;

/** A transform is correct for an entity if every sampled point of the original maps onto the transformed curve. */
function mapsOnto(src: Entity, t: Transform2) {
  const out = transformEntity(src, t);
  const target = flattenEntity(out, TOL);
  const dist = (p: Vec2) => Math.min(...target.slice(1).map((q, i) => segDist(p, target[i]!, q)));
  for (const p of flattenEntity(src, TOL * 10)) expect(dist(applyPoint(t, p))).toBeLessThan(0.01);
}
function segDist(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

describe('transforms (REQ-003.6)', () => {
  it('point maths: translate, rotate, scale, mirror', () => {
    expect(applyPoint(translation(3, -4), [1, 1])).toEqual([4, -3]);
    const r = applyPoint(rotationAbout([10, 0], Math.PI / 2), [20, 0]);
    expect(r[0]).toBeCloseTo(10, 12);
    expect(r[1]).toBeCloseTo(10, 12);
    expect(applyPoint(scaleAbout([1, 1], 3), [2, 1])).toEqual([4, 1]);
    const m = applyPoint(mirrorAcross([0, 0], [1, 1]), [5, 2]);
    expect(m[0]).toBeCloseTo(2, 12);
    expect(m[1]).toBeCloseTo(5, 12);
  });

  it('every entity kind maps exactly onto its transformed curve', () => {
    const ts = [translation(12, -5), rotationAbout([3, 4], 1.1), scaleAbout([-2, 1], 2.5), mirrorAcross([0, -3], [7, 9])];
    for (const s of samples) for (const t of ts) mapsOnto(s, t);
  });

  it('mirroring an arc keeps it counter-clockwise with the same sweep', () => {
    const a = samples[2] as ArcEntity;
    const m = transformEntity(a, mirrorAcross([0, 0], [0, 1])) as ArcEntity;
    expect(sweep(m.startAngle, m.endAngle)).toBeCloseTo(sweep(a.startAngle, a.endAngle), 9);
  });

  it('property: rotation preserves length; scale multiplies it', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: 0.1, max: 10, noNaN: true }), (angle, k) => {
        for (const s of samples) {
          const len = entityLength(s, TOL);
          expect(entityLength(transformEntity(s, rotationAbout([7, -3], angle)), TOL)).toBeCloseTo(len, 1);
          expect(entityLength(transformEntity(s, scaleAbout([0, 0], k)), TOL) / len).toBeCloseTo(k, 2);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('mirroring twice is the identity', () => {
    const m = mirrorAcross([2, 3], [9, -1]);
    for (const s of samples) {
      const back = transformEntity(transformEntity(s, m), m);
      const a = flattenEntity(s, TOL);
      const b = flattenEntity(back, TOL);
      expect(b.length).toBe(a.length);
      a.forEach((p, i) => {
        expect(b[i]![0]).toBeCloseTo(p[0], 6);
        expect(b[i]![1]).toBeCloseTo(p[1], 6);
      });
    }
  });
});
