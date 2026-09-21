import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ArcEntity, CircleEntity, Entity, EntityId, LineEntity, PolylineEntity } from '@cadw/core';
import { entityLength, extendEntity, flattenEntity, offsetEntity, sweep, trimEntity, type Vec2 } from '../src/index.ts';

let n = 0;
const mk = <T extends Entity>(kind: T['kind'], rest: Omit<T, 'id' | 'layer' | 'kind'>): T => ({ id: `t${n++}` as EntityId, layer: '0', kind, ...rest }) as T;
const line = (a: Vec2, b: Vec2) => mk<LineEntity>('line', { start: [a[0], a[1], 0], end: [b[0], b[1], 0] });
const TOL = 1e-6;
const ok = <T,>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('TRIM (REQ-003.6)', () => {
  const h = line([0, 0], [100, 0]);
  const v1 = line([30, -10], [30, 10]);
  const v2 = line([70, -10], [70, 10]);

  it('removes the middle of a line between two cutting edges', () => {
    const r = ok(trimEntity(h, [50, 0], [h, v1, v2], TOL));
    expect(r.kept.map((e) => [(e as LineEntity).start, (e as LineEntity).end])).toEqual([
      [[0, 0, 0], [30, 0, 0]],
      [[70, 0, 0], [100, 0, 0]],
    ]);
    expect((r.removed[0] as LineEntity).start).toEqual([30, 0, 0]);
  });

  it('removes an end of a line up to the first crossing', () => {
    const r = ok(trimEntity(h, [90, 0], [h, v1, v2], TOL));
    expect(r.kept).toHaveLength(1);
    expect((r.kept[0] as LineEntity).end).toEqual([70, 0, 0]);
  });

  it('refuses when nothing crosses', () => {
    expect(trimEntity(h, [50, 0], [h], TOL).ok).toBe(false);
  });

  it('trims a circle into the arc that remains', () => {
    const c = mk<CircleEntity>('circle', { center: [0, 0, 0], radius: 10 });
    const cutter = line([-20, 0], [20, 0]);
    const r = ok(trimEntity(c, [0, 10], [c, cutter], TOL)); // remove the top half
    const a = r.kept[0] as ArcEntity;
    expect(a.kind).toBe('arc');
    expect(sweep(a.startAngle, a.endAngle)).toBeCloseTo(Math.PI, 9);
    const mid = flattenEntity(a, 1e-3)[Math.floor(flattenEntity(a, 1e-3).length / 2)]!;
    expect(mid[1]).toBeLessThan(0); // bottom half kept
  });

  it('trims an arc end', () => {
    const a = mk<ArcEntity>('arc', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI });
    const cutter = line([0, 0], [0, 20]); // crosses at the top (90°)
    const r = ok(trimEntity(a, [-7, 7], [a, cutter], TOL));
    const k = r.kept[0] as ArcEntity;
    expect(sweep(k.startAngle, k.endAngle)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('trims across polyline vertices, and a closed polyline into an open one', () => {
    const pl = mk<PolylineEntity>('polyline', { points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]], closed: false });
    const cut1 = line([50, -10], [50, 10]);
    const cut2 = line([90, 50], [110, 50]);
    const r = ok(trimEntity(pl, [100, 5], [pl, cut1, cut2], TOL));
    const [a, b] = r.kept as PolylineEntity[];
    expect(a!.points).toEqual([[0, 0, 0], [50, 0, 0]]);
    expect(b!.points).toEqual([[100, 50, 0], [100, 100, 0]]);

    const sq = mk<PolylineEntity>('polyline', { points: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], closed: true });
    const r2 = ok(trimEntity(sq, [100, 80], [sq, cut1, cut2], TOL));
    const open = r2.kept[0] as PolylineEntity;
    expect(open.closed).toBe(false);
    expect(entityLength(open, 1e-3) + entityLength(r2.removed[0]!, 1e-3)).toBeCloseTo(400, 6);
    // Removed: from (100,50) up the right edge, across the top, down the left, along the bottom to (50,0).
    expect(entityLength(r2.removed[0]!, 1e-3)).toBeCloseTo(50 + 100 + 100 + 50, 6);
  });

  it('property: trimming a closed square conserves perimeter wherever the pick lands', () => {
    const sq = mk<PolylineEntity>('polyline', { points: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], closed: true });
    const cutters = [line([50, -10], [50, 10]), line([90, 50], [110, 50]), line([-10, 30], [10, 30])];
    fc.assert(
      fc.property(fc.double({ min: 0, max: 399.99, noNaN: true }), (u) => {
        const side = Math.floor(u / 100);
        const f = (u % 100) / 100;
        const corners: Vec2[] = [[f * 100, 0], [100, f * 100], [100 - f * 100, 100], [0, 100 - f * 100]];
        const pick = corners[side]!;
        fc.pre(![[50, 0], [100, 50], [0, 30]].some(([x, y]) => Math.hypot(pick[0] - x!, pick[1] - y!) < 1e-3));
        const r = trimEntity(sq, pick, [sq, ...cutters], TOL);
        if (!r.ok) throw new Error(r.reason);
        const total = [...r.value.kept, ...r.value.removed].reduce((s, e) => s + entityLength(e, 1e-3), 0);
        expect(total).toBeCloseTo(400, 6);
      }),
    );
  });

  it('property: kept + removed length equals the original line length', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 99, noNaN: true }), fc.double({ min: 1, max: 99, noNaN: true }), fc.double({ min: 0.5, max: 99.5, noNaN: true }), (x1, x2, px) => {
        fc.pre(Math.abs(x1 - x2) > 1e-3 && Math.abs(px - x1) > 1e-3 && Math.abs(px - x2) > 1e-3);
        const r = trimEntity(h, [px, 0], [h, line([x1, -5], [x1, 5]), line([x2, -5], [x2, 5])], TOL);
        if (!r.ok) throw new Error(r.reason);
        const total = [...r.value.kept, ...r.value.removed].reduce((s, e) => s + entityLength(e), 0);
        expect(total).toBeCloseTo(100, 6);
      }),
    );
  });
});

describe('EXTEND (REQ-003.6)', () => {
  it('extends a line end to the nearest boundary in its direction', () => {
    const l = line([0, 0], [50, 0]);
    const b1 = line([80, -10], [80, 10]);
    const b2 = line([120, -10], [120, 10]);
    const behind = line([-30, -10], [-30, 10]);
    expect(ok(extendEntity(l, [45, 1], [l, b1, b2, behind], TOL))).toMatchObject({ end: [80, 0, 0] });
    expect(ok(extendEntity(l, [3, 1], [l, b1, b2, behind], TOL))).toMatchObject({ start: [-30, 0, 0] });
  });

  it('extends to a circle and fails with no boundary', () => {
    const l = line([0, 0], [10, 0]);
    const c = mk<CircleEntity>('circle', { center: [100, 0, 0], radius: 20 });
    expect(ok(extendEntity(l, [9, 0], [l, c], TOL))).toMatchObject({ end: [80, 0, 0] });
    expect(extendEntity(l, [9, 0], [l], TOL).ok).toBe(false);
  });

  it('extends an arc along its circle to a boundary', () => {
    const a = mk<ArcEntity>('arc', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 4 });
    const b = line([-20, 0], [0, 0]); // crosses the circle at 180°
    const r = ok(extendEntity(a, [7, 7], [a, b], TOL)) as ArcEntity;
    expect(sweep(r.startAngle, r.endAngle)).toBeCloseTo(Math.PI, 9);
  });

  it('extends the last segment of an open polyline; refuses closed ones', () => {
    const pl = mk<PolylineEntity>('polyline', { points: [[0, 0, 0], [50, 0, 0], [50, 30, 0]], closed: false });
    const b = line([40, 80], [60, 80]);
    expect(ok(extendEntity(pl, [50, 29], [pl, b], TOL))).toMatchObject({ points: [[0, 0, 0], [50, 0, 0], [50, 80, 0]] });
    const c = mk<CircleEntity>('circle', { center: [0, 0, 0], radius: 5 });
    expect(extendEntity(c, [5, 0], [c, b], TOL).ok).toBe(false);
  });
});

describe('OFFSET (REQ-003.6)', () => {
  it('offsets a line to the picked side', () => {
    const l = line([0, 0], [100, 0]);
    expect(ok(offsetEntity(l, 10, [50, 30]))).toMatchObject({ start: [0, 10, 0], end: [100, 10, 0] });
    expect(ok(offsetEntity(l, 10, [50, -30]))).toMatchObject({ start: [0, -10, 0], end: [100, -10, 0] });
  });

  it('offsets circles and arcs in or out, refusing collapse', () => {
    const c = mk<CircleEntity>('circle', { center: [0, 0, 0], radius: 10 });
    expect((ok(offsetEntity(c, 5, [30, 0])) as CircleEntity).radius).toBe(15);
    expect((ok(offsetEntity(c, 5, [1, 0])) as CircleEntity).radius).toBe(5);
    expect(offsetEntity(c, 15, [1, 0]).ok).toBe(false);
  });

  it('offsets a closed rectangle outward with mitred corners', () => {
    const sq = mk<PolylineEntity>('polyline', { points: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0]], closed: true });
    const out = ok(offsetEntity(sq, 5, [50, -20])) as PolylineEntity;
    const pts = out.points.map(([x, y]) => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9]);
    expect(pts).toEqual([[-5, -5], [105, -5], [105, 55], [-5, 55]]);
  });

  it('property: every offset line point is exactly d from the original line', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1000, noNaN: true }), fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (d, ang) => {
        const l = line([0, 0], [100 * Math.cos(ang), 100 * Math.sin(ang)]);
        const o = ok(offsetEntity(l, d, [-Math.sin(ang) * 5, Math.cos(ang) * 5])) as LineEntity;
        const dist = Math.abs(-Math.sin(ang) * o.start[0] + Math.cos(ang) * o.start[1]);
        expect(dist).toBeCloseTo(d, 6);
      }),
    );
  });

  it('reports ellipses and splines as not yet supported', () => {
    const el = mk<Entity>('ellipse', { center: [0, 0, 0], majorAxis: [10, 0, 0], ratio: 0.5 } as never);
    const r = offsetEntity(el, 1, [20, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not supported yet/);
  });
});
